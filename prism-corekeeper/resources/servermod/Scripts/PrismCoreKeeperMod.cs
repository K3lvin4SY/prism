// Prism Core Keeper server mod {{VERSION}}: server only, read only. Reports to the Pterodactyl
// Panel what only the running game knows, as two files in the server's mods config folder
// (<data>/mods/PrismCoreKeeper/):
//
//   players.json  the players online now, rewritten every few seconds
//   events.json   this run's joins, leaves and Cartography Table syncs, newest last, numbered
//
// A Cartography Table sync is a player's client sending the server the list of its map parts
// (ListMapResponse); the RPC carries the player's connection, so the sync has a name.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
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
    private const int MaxEvents = 200;
    // A player's sync at a table sends many parts; one event per player per minute.
    private const double SyncDebounceSeconds = 60;
    // The player's own inventory: the hotbar and the bag. Gear sits in the slots after it.
    private const int MainInventorySlots = 50;

    private World _world;
    private EntityQuery _players;
    private EntityQuery _mapLists;
    private float _nextReport;
    private readonly long _started = Now();
    private int _sequence;
    private readonly List<string> _events = new List<string>();
    private readonly Dictionary<string, string> _online = new Dictionary<string, string>();
    private readonly Dictionary<string, double> _lastSync = new Dictionary<string, double>();
    private bool _failed;

    public void EarlyInit()
    {
        Debug.Log("[Prism Core Keeper mod] loaded");
    }

    public void Init() { }

    public void Shutdown()
    {
        foreach (KeyValuePair<string, string> player in new List<KeyValuePair<string, string>>(_online))
        {
            AddEvent("leave", player.Key, player.Value, null);
        }
        _online.Clear();
        WritePlayers(new List<string>());
    }

    public void ModObjectLoaded(UnityEngine.Object obj) { }

    public void Update()
    {
        if (_failed || API.Server == null)
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
            }

            WatchSyncs(world.EntityManager);
            if (Time.realtimeSinceStartup >= _nextReport)
            {
                _nextReport = Time.realtimeSinceStartup + ReportSeconds;
                Report(world.EntityManager);
            }
        }
        catch (Exception exception)
        {
            // One bad frame should not flood the log; a game update may have changed a type.
            _failed = true;
            Debug.LogError("[Prism Core Keeper mod] stopped: " + exception);
        }
    }

    /** A player at a Cartography Table: their client lists its map parts to the server. */
    private void WatchSyncs(EntityManager entities)
    {
        if (_mapLists.IsEmptyIgnoreFilter)
        {
            return;
        }

        using NativeArray<ReceiveRpcCommandRequest> requests = _mapLists.ToComponentDataArray<ReceiveRpcCommandRequest>(Allocator.Temp);
        using NativeArray<Entity> players = _players.ToEntityArray(Allocator.Temp);
        double now = Time.realtimeSinceStartupAsDouble;
        foreach (ReceiveRpcCommandRequest request in requests)
        {
            foreach (Entity player in players)
            {
                PlayerGhost ghost = entities.GetComponentData<PlayerGhost>(player);
                if (ghost.connection != request.SourceConnection)
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

        if (entities.HasComponent<HealthCD>(player))
        {
            HealthCD health = entities.GetComponentData<HealthCD>(player);
            Number(json, "health", health.health);
            int max = health.maxHealth;
            if (entities.HasBuffer<SummarizedConditionEffectsBuffer>(player))
            {
                max = health.GetMaxHealthWithConditions(entities.GetBuffer<SummarizedConditionEffectsBuffer>(player));
            }
            Number(json, "maxHealth", max);
            json.Append("\"dead\":").Append(health.health <= 0 ? "true" : "false").Append(',');
        }
        if (entities.HasComponent<HungerCD>(player))
        {
            Number(json, "hunger", entities.GetComponentData<HungerCD>(player).hunger);
        }

        json.Append("\"skills\":[");
        if (entities.HasBuffer<SkillBuffer>(player))
        {
            DynamicBuffer<SkillBuffer> skills = entities.GetBuffer<SkillBuffer>(player);
            for (int i = 0; i < skills.Length && i < (int)SkillID.NUM_SKILLS; i++)
            {
                if (i > 0) json.Append(',');
                json.Append("{\"name\":\"").Append(((SkillID)i).ToString()).Append("\",\"level\":")
                    .Append(SkillExtensions.GetLevelFromSkill((SkillID)i, skills[i].Value).ToString(CultureInfo.InvariantCulture)).Append('}');
            }
        }
        json.Append("],");

        json.Append("\"equipment\":[");
        bool first = true;
        if (entities.HasComponent<EquippedObjectCD>(player))
        {
            ObjectDataCD held = entities.GetComponentData<EquippedObjectCD>(player).containedObject.objectData;
            if (held.objectID != ObjectID.None)
            {
                Item(json, "Held", held);
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
                if (!first) json.Append(',');
                Item(json, type.ToString(), item);
                first = false;
            }
        }
        json.Append("],");

        json.Append("\"customization\":{");
        if (entities.HasComponent<PlayerCustomizationCD>(player))
        {
            PlayerCustomizationNetcode look = entities.GetComponentData<PlayerCustomizationCD>(player).customization;
            json.Append("\"character\":").Append(Quote(look.name.ToString())).Append(',');
            json.Append("\"background\":").Append(Quote(((CharacterRole)look.role).ToString()));
        }
        json.Append("}}");

        return json.ToString();
    }

    private static bool IsGear(ObjectType type)
    {
        return type == ObjectType.Helm || type == ObjectType.BreastArmor || type == ObjectType.PantsArmor || type == ObjectType.Necklace
            || type == ObjectType.Ring || type == ObjectType.Offhand || type == ObjectType.Bag || type == ObjectType.Lantern
            || type == ObjectType.Pouch || type == ObjectType.Pet;
    }

    private static void Item(StringBuilder json, string slot, ObjectDataCD item)
    {
        json.Append("{\"slot\":").Append(Quote(slot)).Append(",\"name\":").Append(Quote(item.objectID.ToString()))
            .Append(",\"id\":").Append(((int)item.objectID).ToString(CultureInfo.InvariantCulture))
            .Append(",\"amount\":").Append(item.amount.ToString(CultureInfo.InvariantCulture)).Append('}');
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
        Write("players.json", "{\"version\":\"{{VERSION}}\",\"utc\":" + Now() + ",\"started\":" + _started + ",\"players\":[" + string.Join(",", players) + "]}");
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
        foreach (char c in value)
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
