import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Select,
  ServerContentBlock,
  Spinner,
  httpErrorToHuman,
  toast,
} from "@pterodactyl/sdk";
import { keys } from "../api/client";
import { duration } from "../lib/format";
import {
  categories,
  claim,
  connect,
  definitionsFor,
  disconnect,
  getSettings,
  newGame,
  saveGame,
  updateSettings,
  validate,
  type SettingsResponse,
} from "../api/settings";
import SaveBar, { describeValue } from "../components/SaveBar";
import SettingsBrowser from "../components/SettingsBrowser";
import { useSatisfactoryInfo } from "../hooks/useSatisfactoryInfo";
import { NamedIcon } from "../icons";

export default function PropertiesScreen() {
  const { identifier, info } = useSatisfactoryInfo();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: keys.properties(identifier),
    queryFn: () => getSettings(identifier),
  });
  const refresh = () =>
    void queryClient.invalidateQueries({
      queryKey: keys.properties(identifier),
    });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = Object.keys(draft).length > 0;

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Without the API only the startup variables can be changed.
  const kind = query.data?.api.connected
    ? "satisfactory"
    : "satisfactory-offline";
  const definitions = useMemo(() => definitionsFor(kind), [kind]);
  const saved = query.data?.values ?? {};
  const current = (key: string) =>
    saved[key] ??
    String(
      definitions.find((definition) => definition.key === key)?.default ?? "",
    );

  const change = (key: string, value: string) =>
    setDraft((now) => {
      const next = { ...now };
      if (value === current(key)) delete next[key];
      else next[key] = value;

      return next;
    });

  const changes = Object.entries(draft).map(([key, value]) => {
    const definition = definitions.find((item) => item.key === key);
    const options = definition?.options?.map((option) => ({
      value: option,
      label: definition.optionLabels?.[option] ?? option,
    }));
    const section = categories.find(
      (entry) => entry.id === definition?.category,
    )?.label;
    // A secret is never shown, not even the one being typed.
    if (definition?.type === "secret") {
      return {
        key,
        label: definition.label,
        section,
        from: query.data?.secrets[key] ? "saved" : "not shown",
        to: value === "" ? "none" : "a new one",
      };
    }

    return {
      key,
      label: definition?.label ?? key,
      section,
      from: describeValue(current(key), options),
      to: describeValue(value, options),
    };
  });
  const problems = Object.entries(draft).flatMap(([key, value]) => {
    const definition = definitions.find((item) => item.key === key);
    const problem = definition ? validate(definition, value) : null;

    return problem ? [`${definition?.label ?? key}: ${problem}`] : [];
  });

  const save = async () => {
    setSaving(true);
    try {
      const changed = await updateSettings(identifier, draft);
      const secrets = Object.fromEntries(
        definitions
          .filter(
            (definition) =>
              definition.type === "secret" && draft[definition.key],
          )
          .map((definition) => [definition.key, true]),
      );
      queryClient.setQueryData<SettingsResponse>(
        keys.properties(identifier),
        (now) =>
          now
            ? {
                ...now,
                values: { ...now.values, ...draft, ...changed },
                secrets: { ...now.secrets, ...secrets },
              }
            : now,
      );
      setDraft({});
      toast.success(
        "Saved. Startup variables and some server options apply after the next restart.",
      );
    } catch (exception) {
      toast.error(httpErrorToHuman(exception));
    } finally {
      setSaving(false);
    }
  };

  const data = query.data;

  return (
    <ServerContentBlock title={"Properties"}>
      {query.isLoading || !info ? (
        <Spinner centered />
      ) : query.isError || !data ? (
        <Alert type={"danger"}>{httpErrorToHuman(query.error)}</Alert>
      ) : (
        <div className={"sfy:flex sfy:flex-col sfy:gap-4"}>
          <ApiCard identifier={identifier} data={data} onChanged={refresh} />
          {data.api.connected && (
            <GameCard identifier={identifier} data={data} onChanged={refresh} />
          )}
          <SettingsBrowser
            kind={kind}
            files={data.api.connected ? data.files : ["the startup variables"]}
            values={data.values}
            draft={draft}
            onChange={change}
            eggBindings={data.eggBindings}
            secrets={data.secrets}
          />
          <SaveBar
            changes={changes}
            problems={problems}
            saving={saving}
            onSave={save}
            onDiscard={() => setDraft({})}
            onUndo={(key) =>
              setDraft((now) => {
                const { [key]: _undone, ...rest } = now;

                return rest;
              })
            }
          />
        </div>
      )}
    </ServerContentBlock>
  );
}

function Card({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className={
        "pt-surface sfy:flex sfy:flex-col sfy:gap-3 sfy:rounded-lg sfy:border sfy:border-border sfy:bg-card sfy:p-4"
      }
    >
      <div className={"sfy:flex sfy:items-center sfy:gap-2"}>
        <NamedIcon name={icon} size={18} className={"sfy:text-primary"} />
        <h2 className={"sfy:flex-1 sfy:font-semibold"}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Whether the Panel can reach the server's API and sign in, and the forms to make it so. */
function ApiCard({
  identifier,
  data,
  onChanged,
}: {
  identifier: string;
  data: SettingsResponse;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      setPassword("");
      onChanged();
    } catch (error) {
      toast.error(httpErrorToHuman(error));
    } finally {
      setBusy(false);
    }
  };

  if (!data.running) {
    return (
      <Alert type={"info"}>
        Start the server to change its own settings and start a game. The
        startup variables below can be changed now.
      </Alert>
    );
  }
  if (!data.api.reachable) {
    return (
      <Alert type={"warning"}>
        The server's API on its game port does not answer yet. It does once the
        server has finished starting; until then only the startup variables can
        be changed.
      </Alert>
    );
  }
  if (data.api.connected) {
    return (
      <div
        className={
          "sfy:flex sfy:flex-wrap sfy:items-center sfy:gap-2 sfy:text-sm sfy:text-muted-foreground"
        }
      >
        <NamedIcon
          name={"circle-check"}
          size={16}
          className={"sfy:text-success"}
        />
        <span className={"sfy:flex-1"}>
          The Panel is signed in to the server as its admin.
        </span>
        <Button.Text
          size={"small"}
          disabled={busy}
          onClick={() =>
            void run(
              () => disconnect(identifier),
              "The Panel has forgotten the admin password.",
            )
          }
        >
          Forget the password
        </Button.Text>
      </div>
    );
  }

  if (data.api.claimed === false) {
    return (
      <Card title={"Set up the server"} icon={"key-round"}>
        <p className={"sfy:text-sm sfy:text-muted-foreground"}>
          This server has no admin yet. Give it a name and an admin password;
          the Panel keeps the password, encrypted, to change settings. You use
          it to sign in from the game's server manager too.
        </p>
        <form
          className={"sfy:flex sfy:flex-wrap sfy:gap-2"}
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              () => claim(identifier, name.trim(), password),
              "The server is set up.",
            );
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={"Server name"}
            className={"sfy:min-w-48 sfy:flex-1"}
          />
          <Input
            type={"password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={"Admin password (6 or more)"}
            autoComplete={"new-password"}
            className={"sfy:min-w-48 sfy:flex-1"}
          />
          <Button
            type={"submit"}
            isLoading={busy}
            disabled={name.trim() === "" || password.length < 6}
          >
            Set up
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card title={"Connect the Panel"} icon={"key-round"}>
      <p className={"sfy:text-sm sfy:text-muted-foreground"}>
        {data.api.error ??
          "Satisfactory keeps its settings itself. Enter the server’s admin password, as set in the game’s server manager, so the Panel can read and change them. It is kept encrypted."}
      </p>
      <form
        className={"sfy:flex sfy:flex-wrap sfy:gap-2"}
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => connect(identifier, password), "Connected.");
        }}
      >
        <Input
          type={"password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={"Admin password"}
          autoComplete={"current-password"}
          className={"sfy:min-w-48 sfy:flex-1"}
        />
        <Button type={"submit"} isLoading={busy} disabled={password === ""}>
          Connect
        </Button>
      </form>
    </Card>
  );
}

/** The game the server runs: start a new one, save, and which session loads on start. */
function GameCard({
  identifier,
  data,
  onChanged,
}: {
  identifier: string;
  data: SettingsResponse;
  onChanged: () => void;
}) {
  const game = data.game;
  const [session, setSession] = useState("");
  const [location, setLocation] = useState(data.locations[0] ?? "Grass Fields");
  const [skipTutorial, setSkipTutorial] = useState(true);
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (
    key: string,
    action: () => Promise<void>,
    done: string,
  ) => {
    setBusy(key);
    try {
      await action();
      toast.success(done);
      onChanged();
    } catch (error) {
      toast.error(httpErrorToHuman(error));
    } finally {
      setBusy(null);
    }
  };

  const sessionNames = data.sessions.map((entry) => entry.name).filter(Boolean);

  return (
    <Card title={"The game"} icon={"factory"}>
      {game?.running ? (
        <p className={"sfy:text-sm"}>
          Playing <span className={"sfy:font-semibold"}>{game.session}</span> ·
          tier {game.tier} · {duration(game.duration)} played
        </p>
      ) : (
        <p className={"sfy:text-sm sfy:text-muted-foreground"}>
          No game is loaded. Start a new one here, or load a save from the
          game's server manager.
        </p>
      )}

      <div className={"sfy:grid sfy:gap-4 sfy:md:grid-cols-2"}>
        <form
          className={"sfy:flex sfy:flex-col sfy:gap-2"}
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              "new",
              () => newGame(identifier, session.trim(), location, skipTutorial),
              `Starting ${session.trim()}.`,
            );
          }}
        >
          <h3 className={"sfy:text-sm sfy:font-semibold"}>New game</h3>
          <Input
            value={session}
            onChange={(event) => setSession(event.target.value)}
            placeholder={"Session name"}
          />
          <Select
            value={location}
            onChange={(value) => setLocation(String(value))}
            options={data.locations.map((entry) => ({
              value: entry,
              label: entry,
            }))}
          />
          <label className={"sfy:flex sfy:items-center sfy:gap-2 sfy:text-sm"}>
            <Checkbox checked={skipTutorial} onChange={setSkipTutorial} /> Skip
            the tutorial
          </label>
          {game?.running && (
            <p className={"sfy:text-xs sfy:text-warning"}>
              The running game is left without saving first.
            </p>
          )}
          <Button
            type={"submit"}
            size={"small"}
            isLoading={busy === "new"}
            disabled={!/^[A-Za-z0-9 _.-]+$/.test(session.trim())}
          >
            Start new game
          </Button>
        </form>

        {(game?.running || sessionNames.length > 0) && (
          <div className={"sfy:flex sfy:flex-col sfy:gap-2"}>
            <h3 className={"sfy:text-sm sfy:font-semibold"}>Save and load</h3>
            {game?.running && (
              <form
                className={"sfy:flex sfy:gap-2"}
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    "save",
                    () => saveGame(identifier, saveName.trim()),
                    `Saved as ${saveName.trim()}.`,
                  ).then(() => setSaveName(""));
                }}
              >
                <Input
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                  placeholder={"Save name"}
                  className={"sfy:flex-1"}
                />
                <Button
                  type={"submit"}
                  size={"small"}
                  isLoading={busy === "save"}
                  disabled={!/^[A-Za-z0-9 _.-]+$/.test(saveName.trim())}
                >
                  Save now
                </Button>
              </form>
            )}
            {sessionNames.length > 0 && (
              <>
                <span className={"sfy:text-xs sfy:text-muted-foreground"}>
                  Session to load when the server starts
                </span>
                <Select
                  value={game?.autoLoad ?? ""}
                  onChange={(value) =>
                    void run(
                      "autoload",
                      () =>
                        updateSettings(identifier, {
                          autoLoadSessionName: String(value),
                        }).then(() => undefined),
                      "Saved. It loads at the next start.",
                    )
                  }
                  options={sessionNames.map((entry) => ({
                    value: entry,
                    label: entry,
                  }))}
                />
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
