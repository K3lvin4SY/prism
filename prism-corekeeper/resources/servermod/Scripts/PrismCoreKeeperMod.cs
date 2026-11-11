// Prism Core Keeper server mod {{VERSION}}: server only, read only. Reports to the Pterodactyl
// Panel what only the running game knows, as two files in the server's mods config folder
// (<data>/mods/PrismCoreKeeper/):
//
//   players.json  the players online now, rewritten every few seconds, with the mod's own health:
//                 which way it watches map syncs and anything that failed ("problems")
//   events.json   this run's joins, leaves and Cartography Table syncs, newest last, numbered
//
// A Cartography Table sync is a player's client sending the server the list of its map parts
// (ListMapResponse); the RPC carries the player's connection, so the sync has a name. The game's
// ShareMapServerSystem consumes those RPCs in its own tick, so a small system placed just before it
// sees every one; only if that system cannot be added does the mod fall back to looking once a frame.
//
// Failures are kept apart: a part of a player's details that throws (a game update may have
// changed a type) is left out and named in "problems", the rest still reports, and a failing
// report is retried every half minute instead of stopping. Each distinct error is logged once.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using I2.Loc;
using PugMod;
using Unity.Collections;
using Unity.Entities;
using Unity.NetCode;
using Unity.Transforms;
using UnityEngine;

public class PrismCoreKeeperMod : IMod
{
    private const string Folder = "PrismCoreKeeper";
    private const float ReportSeconds = 3f;
    private const float RetrySeconds = 30f;
    private const int MaxEvents = 200;
    // A player's sync at a table sends many parts; one event per player per minute.
    private const double SyncDebounceSeconds = 60;
    // The player's own inventory: the hotbar and the bag. Gear sits in the slots after it.
    private const int MainInventorySlots = 50;

    /** Connections that sent a map list since the last frame, filled by PrismMapSyncWatchSystem. */
    internal static readonly List<Entity> PendingSyncs = new List<Entity>();
    /** Set by PrismMapSyncWatchSystem each tick it runs. */
    internal static int WatchTicks;

    private World _world;
    private EntityQuery _players;
    private EntityQuery _mapLists;
    private string _syncWatch = "starting";
    private float _nextReport;
    private float _retryAt;
    private readonly long _started = Now();
    private int _sequence;
    private readonly List<string> _events = new List<string>();
    private readonly Dictionary<string, string> _online = new Dictionary<string, string>();
    private readonly Dictionary<string, double> _lastSync = new Dictionary<string, double>();
    private static readonly Dictionary<string, string> Problems = new Dictionary<string, string>();
    private static readonly HashSet<string> Logged = new HashSet<string>();
    private static readonly Dictionary<int, string> ItemNames = new Dictionary<int, string>();

    public void EarlyInit()
    {
        Debug.Log("[Prism Core Keeper mod] loaded");
    }

    public void Init() { }

    public void Shutdown()
    {
        try
        {
            foreach (KeyValuePair<string, string> player in new List<KeyValuePair<string, string>>(_online))
            {
                AddEvent("leave", player.Key, player.Value, null);
            }
            _online.Clear();
            WritePlayers(new List<string>());
        }
        catch (Exception exception)
        {
            Fail("shutdown", exception);
        }
    }

    public void ModObjectLoaded(UnityEngine.Object obj) { }

    public void Update()
    {
        if (API.Server == null || Time.realtimeSinceStartup < _retryAt)
        {
            return;
        }

        try
        {
            World world = API.Server.World;
            if (world == null || !world.IsCreated)
            {
                _world = null;
                return;
            }
            if (world != _world)
            {
                _world = world;
                _players = world.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<PlayerGhost>(), ComponentType.ReadOnly<LocalTransform>());
                _mapLists = world.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<ListMapResponse>(), ComponentType.ReadOnly<ReceiveRpcCommandRequest>());
                _syncWatch = AddSyncWatch(world);
            }

            Guard("syncs", () => WatchSyncs(world.EntityManager));
            if (Time.realtimeSinceStartup >= _nextReport)
            {
                _nextReport = Time.realtimeSinceStartup + ReportSeconds;
                Report(world.EntityManager);
            }
            Problems.Remove("report");
        }
        catch (Exception exception)
        {
            // Try again in a while: the next report, or a new world, may well work.
            Fail("report", exception);
            _retryAt = Time.realtimeSinceStartup + RetrySeconds;
            _world = null;
        }
    }

    /** Puts PrismMapSyncWatchSystem into the server world, unless the game already did. */
    private static string AddSyncWatch(World world)
    {
        try
        {
            if (world.GetExistingSystemManaged<PrismMapSyncWatchSystem>() == null)
            {
                PrismMapSyncWatchSystem system = world.CreateSystemManaged<PrismMapSyncWatchSystem>();
                world.GetExistingSystemManaged<RunSimulationSystemGroup>().AddSystemToUpdateList(system);
            }
            Problems.Remove("syncWatch");
            return "system";
        }
        catch (Exception exception)
        {
            Fail("syncWatch", exception);
            return "frame";
        }
    }

    /** A player at a Cartography Table: their client lists its map parts to the server. */
    private void WatchSyncs(EntityManager entities)
    {
        var connections = new List<Entity>();
        if (WatchTicks > 0)
        {
            connections.AddRange(PendingSyncs);
        }
        else if (!_mapLists.IsEmptyIgnoreFilter)
        {
            // The system is not running: look for the RPCs that are still waiting this frame.
            using NativeArray<ReceiveRpcCommandRequest> requests = _mapLists.ToComponentDataArray<ReceiveRpcCommandRequest>(Allocator.Temp);
            foreach (ReceiveRpcCommandRequest request in requests)
            {
                connections.Add(request.SourceConnection);
            }
        }
        PendingSyncs.Clear();
        if (connections.Count == 0)
        {
            return;
        }

        using NativeArray<Entity> players = _players.ToEntityArray(Allocator.Temp);
        double now = Time.realtimeSinceStartupAsDouble;
        foreach (Entity connection in connections)
        {
            foreach (Entity player in players)
            {
                PlayerGhost ghost = entities.GetComponentData<PlayerGhost>(player);
                if (ghost.connection != connection)
                {
                    continue;
                }
                string id = IdOf(ghost);
                if (_lastSync.TryGetValue(id, out double last) && now - last < SyncDebounceSeconds)
                {
                    break;
                }
                _lastSync[id] = now;
                AddEvent("cartography", id, NameOf(entities, player, ghost), SteamIdOf(ghost));
                break;
            }
        }
    }

    private void Report(EntityManager entities)
    {
        var lines = new List<string>();
        var seen = new HashSet<string>();
        using NativeArray<Entity> players = _players.ToEntityArray(Allocator.Temp);
        foreach (Entity player in players)
        {
            PlayerGhost ghost = entities.GetComponentData<PlayerGhost>(player);
            string id = IdOf(ghost);
            string name = NameOf(entities, player, ghost);
            seen.Add(id);
            if (!_online.ContainsKey(id))
            {
                _online[id] = name;
                AddEvent("join", id, name, SteamIdOf(ghost));
            }
            lines.Add(Describe(entities, player, ghost, name));
        }
        foreach (string id in new List<string>(_online.Keys))
        {
            if (!seen.Contains(id))
            {
                AddEvent("leave", id, _online[id], null);
                _online.Remove(id);
            }
        }
        WritePlayers(lines);
    }

    private static string Describe(EntityManager entities, Entity player, PlayerGhost ghost, string name)
    {
        var json = new StringBuilder("{");
        Field(json, "guid", ghost.playerGuid.ToString());
        Field(json, "steamId", SteamIdOf(ghost));
        Field(json, "name", name);
        LocalTransform transform = entities.GetComponentData<LocalTransform>(player);
        Number(json, "x", transform.Position.x);
        Number(json, "y", transform.Position.z);

        Part(json, "health", part =>
        {
            if (!entities.HasComponent<HealthCD>(player))
            {
                return;
            }
            HealthCD health = entities.GetComponentData<HealthCD>(player);
            Number(part, "health", health.health);
            int max = health.maxHealth;
            if (entities.HasBuffer<SummarizedConditionEffectsBuffer>(player))
            {
                max = health.GetMaxHealthWithConditions(entities.GetBuffer<SummarizedConditionEffectsBuffer>(player));
            }
            Number(part, "maxHealth", max);
            part.Append("\"dead\":").Append(health.health <= 0 ? "true" : "false").Append(',');
        });
        Part(json, "hunger", part =>
        {
            if (entities.HasComponent<HungerCD>(player))
            {
                Number(part, "hunger", entities.GetComponentData<HungerCD>(player).hunger);
            }
        });

        Part(json, "skills", part =>
        {
            part.Append("\"skills\":[");
            if (entities.HasBuffer<SkillBuffer>(player))
            {
                DynamicBuffer<SkillBuffer> skills = entities.GetBuffer<SkillBuffer>(player);
                for (int i = 0; i < skills.Length && i < (int)SkillID.NUM_SKILLS; i++)
                {
                    if (i > 0) part.Append(',');
                    part.Append("{\"name\":\"").Append(((SkillID)i).ToString()).Append("\",\"level\":")
                        .Append(SkillExtensions.GetLevelFromSkill((SkillID)i, skills[i].Value).ToString(CultureInfo.InvariantCulture)).Append('}');
                }
            }
            part.Append("],");
        });

        Part(json, "gear", part =>
        {
            part.Append("\"equipment\":[");
            bool first = true;
            if (entities.HasComponent<EquippedObjectCD>(player))
            {
                ObjectDataCD held = entities.GetComponentData<EquippedObjectCD>(player).containedObject.objectData;
                if (held.objectID != ObjectID.None)
                {
                    Item(part, "Held", held);
                    first = false;
                }
            }
            if (entities.HasBuffer<ContainedObjectsBuffer>(player))
            {
                DynamicBuffer<ContainedObjectsBuffer> inventory = entities.GetBuffer<ContainedObjectsBuffer>(player);
                for (int i = MainInventorySlots; i < inventory.Length; i++)
                {
                    ObjectDataCD item = inventory[i].objectData;
                    if (item.objectID == ObjectID.None)
                    {
                        continue;
                    }
                    ObjectType type = PugDatabase.GetObjectInfo(item.objectID, item.variation).objectType;
                    if (!IsGear(type))
                    {
                        continue;
                    }
                    if (!first) part.Append(',');
                    Item(part, type.ToString(), item);
                    first = false;
                }
            }
            part.Append("],");
        });

        Part(json, "character", part =>
        {
            part.Append("\"customization\":{");
            if (entities.HasComponent<PlayerCustomizationCD>(player))
            {
                PlayerCustomizationNetcode look = entities.GetComponentData<PlayerCustomizationCD>(player).customization;
                part.Append("\"character\":").Append(Quote(look.name.ToString())).Append(',');
                part.Append("\"background\":").Append(Quote(((CharacterRole)look.role).ToString()));
            }
            part.Append("},");
        });

        json.Length--; // the last comma
        return json.Append('}').ToString();
    }

    /** Adds one part of a player's details, or nothing when it throws; the problem is reported. */
    private static void Part(StringBuilder json, string area, Action<StringBuilder> write)
    {
        var part = new StringBuilder();
        try
        {
            write(part);
            json.Append(part);
            Problems.Remove(area);
        }
        catch (Exception exception)
        {
            Fail(area, exception);
        }
    }

    private static void Guard(string area, Action action)
    {
        try
        {
            action();
            Problems.Remove(area);
        }
        catch (Exception exception)
        {
            PendingSyncs.Clear();
            Fail(area, exception);
        }
    }

    /** Keeps the problem for players.json and logs it, once per distinct error. */
    private static void Fail(string area, Exception exception)
    {
        string message = exception.GetType().Name + ": " + exception.Message;
        Problems[area] = message;
        if (Logged.Add(area + "|" + message))
        {
            Debug.LogError("[Prism Core Keeper mod] " + area + " failed: " + exception);
        }
    }

    private static bool IsGear(ObjectType type)
    {
        return type == ObjectType.Helm || type == ObjectType.BreastArmor || type == ObjectType.PantsArmor || type == ObjectType.Necklace
            || type == ObjectType.Ring || type == ObjectType.Offhand || type == ObjectType.Bag || type == ObjectType.Lantern
            || type == ObjectType.Pouch || type == ObjectType.Pet;
    }

    private static void Item(StringBuilder json, string slot, ObjectDataCD item)
    {
        json.Append("{\"slot\":").Append(Quote(slot)).Append(",\"key\":").Append(Quote(item.objectID.ToString()))
            .Append(",\"name\":").Append(Quote(ItemName(item.objectID)))
            .Append(",\"id\":").Append(((int)item.objectID).ToString(CultureInfo.InvariantCulture))
            .Append(",\"amount\":").Append(item.amount.ToString(CultureInfo.InvariantCulture)).Append('}');
    }

    /** The item's English name as the game shows it, or its id spelled out ("CopperHelm" → "Copper Helm"). */
    private static string ItemName(ObjectID id)
    {
        if (ItemNames.TryGetValue((int)id, out string cached))
        {
            return cached;
        }
        string key = id.ToString();
        string name = null;
        try
        {
            if (LocalizationManager.TryGetTranslation("Items/" + key, out string translation, overrideLanguage: "English"))
            {
                name = translation;
            }
        }
        catch (Exception)
        {
            // No translations on this server: spell the id out.
        }
        if (string.IsNullOrWhiteSpace(name) || name.StartsWith("Items/", StringComparison.Ordinal))
        {
            name = SpellOut(key);
        }
        ItemNames[(int)id] = name;
        return name;
    }

    private static string SpellOut(string key)
    {
        var text = new StringBuilder();
        for (int i = 0; i < key.Length; i++)
        {
            char c = key[i];
            if (c == '_')
            {
                text.Append(' ');
                continue;
            }
            if (i > 0 && char.IsUpper(c) && (char.IsLower(key[i - 1]) || (i + 1 < key.Length && char.IsLower(key[i + 1]) && char.IsUpper(key[i - 1]))))
            {
                text.Append(' ');
            }
            text.Append(c);
        }
        return text.ToString().Trim();
    }

    /** The key the Panel keeps players by: their SteamID, or their name. */
    private static string IdOf(PlayerGhost ghost)
    {
        return SteamIdOf(ghost) ?? "name:" + ghost.onlineName.ToString();
    }

    /** PlayerGhost.onlineId is the SteamID64 for Steam players. */
    private static string SteamIdOf(PlayerGhost ghost)
    {
        string id = ghost.onlineId.ToString(CultureInfo.InvariantCulture);
        return id.Length == 17 && id.StartsWith("765", StringComparison.Ordinal) ? id : null;
    }

    private static string NameOf(EntityManager entities, Entity player, PlayerGhost ghost)
    {
        string name = ghost.onlineName.ToString();
        if (name.Length == 0 && entities.HasComponent<PlayerCustomizationCD>(player))
        {
            name = entities.GetComponentData<PlayerCustomizationCD>(player).customization.name.ToString();
        }
        return name.Length > 0 ? name : "Player " + ghost.playerIndex;
    }

    private void AddEvent(string type, string id, string name, string steamId)
    {
        var json = new StringBuilder("{");
        Number(json, "seq", ++_sequence);
        Number(json, "utc", Now());
        Field(json, "type", type);
        Field(json, "id", id);
        Field(json, "steamId", steamId);
        json.Append("\"name\":").Append(Quote(name)).Append('}');
        _events.Add(json.ToString());
        if (_events.Count > MaxEvents)
        {
            _events.RemoveAt(0);
        }

        Write("events.json", "{\"started\":" + _started + ",\"events\":[" + string.Join(",", _events) + "]}");
    }

    private void WritePlayers(List<string> players)
    {
        var problems = new StringBuilder("{");
        foreach (KeyValuePair<string, string> problem in Problems)
        {
            if (problems.Length > 1) problems.Append(',');
            problems.Append(Quote(problem.Key)).Append(':').Append(Quote(problem.Value));
        }
        problems.Append('}');
        Write("players.json", "{\"version\":\"{{VERSION}}\",\"utc\":" + Now() + ",\"started\":" + _started
            + ",\"syncWatch\":" + Quote(WatchTicks > 0 ? "system" : _syncWatch == "system" ? "starting" : "frame") + ",\"problems\":" + problems + ",\"players\":[" + string.Join(",", players) + "]}");
    }

    private static void Write(string file, string content)
    {
        if (!API.ConfigFilesystem.DirectoryExists(Folder))
        {
            API.ConfigFilesystem.CreateDirectory(Folder);
        }
        API.ConfigFilesystem.Write(Folder + "/" + file, Encoding.UTF8.GetBytes(content));
    }

    private static long Now()
    {
        return DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }

    private static void Field(StringBuilder json, string key, string value)
    {
        json.Append('"').Append(key).Append("\":").Append(value == null ? "null" : Quote(value)).Append(',');
    }

    private static void Number(StringBuilder json, string key, double value)
    {
        json.Append('"').Append(key).Append("\":").Append(value.ToString("0.##", CultureInfo.InvariantCulture)).Append(',');
    }

    private static string Quote(string value)
    {
        var json = new StringBuilder("\"");
        foreach (char c in value ?? "")
        {
            switch (c)
            {
                case '"': json.Append("\\\""); break;
                case '\\': json.Append("\\\\"); break;
                default:
                    if (c < 0x20) json.Append("\\u").Append(((int)c).ToString("x4"));
                    else json.Append(c);
                    break;
            }
        }
        return json.Append('"').ToString();
    }
}

/**
 * Sees every Cartography Table map list as it arrives: runs in the server's tick just before the
 * game's ShareMapServerSystem, which consumes them. It only notes the sending connection.
 */
[WorldSystemFilter(WorldSystemFilterFlags.ServerSimulation)]
[UpdateInGroup(typeof(RunSimulationSystemGroup))]
[UpdateBefore(typeof(ShareMapServerSystem))]
public partial class PrismMapSyncWatchSystem : SystemBase
{
    private EntityQuery _requests;

    protected override void OnCreate()
    {
        _requests = GetEntityQuery(ComponentType.ReadOnly<ListMapResponse>(), ComponentType.ReadOnly<ReceiveRpcCommandRequest>());
    }

    protected override void OnUpdate()
    {
        PrismCoreKeeperMod.WatchTicks++;
        if (_requests.IsEmptyIgnoreFilter)
        {
            return;
        }
        using NativeArray<ReceiveRpcCommandRequest> requests = _requests.ToComponentDataArray<ReceiveRpcCommandRequest>(Allocator.Temp);
        foreach (ReceiveRpcCommandRequest request in requests)
        {
            // Bounded: if the mod stops draining, do not grow without end.
            if (PrismCoreKeeperMod.PendingSyncs.Count < 256)
            {
                PrismCoreKeeperMod.PendingSyncs.Add(request.SourceConnection);
            }
        }
    }
}
