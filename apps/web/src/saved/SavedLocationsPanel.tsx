import { useState, type ChangeEvent, type SubmitEvent } from "react";

import { formatCount } from "../format";
import type { ScoutModesState } from "../useScoutModes";
import {
  NAME_MAX_LENGTH,
  describeView,
  exportFileName,
  writeSavedLocations,
  type SavedLocation,
  type SavedView,
} from "./saved-locations";
import type { ImportResult, useSavedLocations } from "./useSavedLocations";

/** The Search Area shown, which can be saved, and the name it is offered under. */
export interface Saveable {
  view: SavedView;
  suggestedName: string;
}

interface SavedLocationsPanelProps {
  saved: ReturnType<typeof useSavedLocations>;
  /** The Search Area shown, or `null` before one has loaded. */
  current: Saveable | null;
  modes: ScoutModesState;
  onOpen: (view: SavedView) => void;
}

const SAVED_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Downloads the Saved Locations as a JSON file (PRD FR-7.2). */
const download = (savedLocations: readonly SavedLocation[]) => {
  const url = URL.createObjectURL(
    new Blob([writeSavedLocations(savedLocations)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFileName(new Date());
  link.click();
  // Once the click has started the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

/** What came of an import, in words. */
const importMessage = (result: ImportResult) => {
  if (!result.ok) return `Couldn't import it. ${result.message}`;
  const imported = `Imported ${formatCount(result.imported, ["Saved Location", "Saved Locations"])}.`;
  return result.skipped === 0
    ? imported
    : `${imported} ${formatCount(result.skipped, ["other was", "others were"])} left out, as unreadable or repeated.`;
};

interface SavedItemProps {
  saved: SavedLocation;
  modes: ScoutModesState;
  onOpen: () => void;
  onRename: (name: string) => boolean;
  onDelete: () => void;
}

/** One Saved Location, with its buttons to open, rename and delete it. */
const SavedItem = ({
  saved,
  modes,
  onOpen,
  onRename,
  onDelete,
}: SavedItemProps) => {
  const [action, setAction] = useState<"rename" | "delete" | null>(null);
  const [name, setName] = useState(saved.name);

  const submitRename = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (onRename(name)) setAction(null);
  };

  return (
    <li className="saved-item">
      {action === "rename" ? (
        <form
          className="saved-rename"
          aria-label={`Rename ${saved.name}`}
          onSubmit={submitRename}
          onKeyDown={(event) => {
            if (event.key === "Escape") setAction(null);
          }}
        >
          <label htmlFor={`saved-rename-${saved.id}`}>New name</label>
          <input
            id={`saved-rename-${saved.id}`}
            value={name}
            maxLength={NAME_MAX_LENGTH}
            required
            // The user has just asked to rename it.
            autoFocus
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <button type="submit" disabled={name.trim() === ""}>
            Save name
          </button>
          <button
            type="button"
            onClick={() => {
              setAction(null);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <h3>{saved.name}</h3>
      )}
      <p>{describeView(saved, modes)}.</p>
      <p className="saved-date">
        Saved {SAVED_DATE_FORMAT.format(new Date(saved.savedAt))}
      </p>
      {action === "delete" ? (
        <div
          className="saved-actions saved-confirm"
          role="group"
          aria-label="Delete it?"
        >
          <span>
            Delete {saved.name}? Nothing else keeps it unless you have exported
            it.
          </span>
          <button
            type="button"
            aria-label={`Delete ${saved.name}`}
            data-variant="danger"
            onClick={onDelete}
          >
            Delete
          </button>
          <button
            type="button"
            aria-label={`Keep ${saved.name}`}
            onClick={() => {
              setAction(null);
            }}
          >
            Keep
          </button>
        </div>
      ) : (
        action === null && (
          <div className="saved-actions">
            <button
              type="button"
              aria-label={`Open ${saved.name}`}
              data-variant="primary"
              onClick={onOpen}
            >
              Open
            </button>
            <button
              type="button"
              aria-label={`Rename ${saved.name}`}
              onClick={() => {
                setName(saved.name);
                setAction("rename");
              }}
            >
              Rename
            </button>
            <button
              type="button"
              aria-label={`Delete ${saved.name}`}
              onClick={() => {
                setAction("delete");
              }}
            >
              Delete
            </button>
          </div>
        )
      )}
    </li>
  );
};

/**
 * The Saved tab (PRD FR-7.1, FR-7.2, FR-9.1): saves the Search Area shown,
 * with its Scout Mode and weights, under a name, lists those saved to open,
 * rename or delete, and exports or imports them as JSON. They are kept in
 * this browser's local storage; when it can't be used, saving is off.
 */
export const SavedLocationsPanel = ({
  saved,
  current,
  modes,
  onOpen,
}: SavedLocationsPanelProps) => {
  const { state } = saved;
  const [name, setName] = useState("");
  // What the last save or import came to, read out once it has.
  const [message, setMessage] = useState<string | null>(null);

  if (state.status === "off") {
    return (
      <aside className="saved-panel" aria-labelledby="saved-heading">
        <h2 id="saved-heading">Saved Locations</h2>
        <p className="saved-off" role="status">
          Saving is off: this browser won&apos;t let Location Scout keep
          anything in its storage, as in some private windows or when site data
          is blocked. Saved Locations can&apos;t be saved, listed or imported
          until it does.
        </p>
      </aside>
    );
  }

  const { savedLocations, refused } = state;

  const submitSave = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current) return;
    const kept = name.trim() || current.suggestedName;
    if (saved.save(kept, current.view)) {
      setName("");
      setMessage(`Saved ${kept.trim()}.`);
    } else {
      setMessage(null);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setMessage("Couldn't import it. The file couldn't be read.");
      return;
    } finally {
      // So choosing the same file again imports it again.
      input.value = "";
    }
    setMessage(importMessage(saved.importText(text)));
  };

  return (
    <aside className="saved-panel" aria-labelledby="saved-heading">
      <h2 id="saved-heading">Saved Locations</h2>
      <p className="saved-note">
        Kept in this browser only. Export them to keep a copy or move them to
        another browser.
      </p>
      <form
        className="saved-form"
        aria-label="Save this Search Area"
        onSubmit={submitSave}
      >
        <label htmlFor="saved-name">Name</label>
        <input
          id="saved-name"
          value={name}
          maxLength={NAME_MAX_LENGTH}
          placeholder={current?.suggestedName}
          disabled={!current}
          aria-describedby="saved-what"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <button type="submit" data-variant="primary" disabled={!current}>
          Save this Search Area
        </button>
        <p id="saved-what" className="saved-what">
          {current
            ? `Saves ${describeView(current.view, modes)}.`
            : "Search for a Location first, then save it here."}
        </p>
      </form>
      {refused && (
        <p className="saved-refused" role="alert">
          The browser refused to keep that change, so it wasn&apos;t made: its
          storage may be full.
        </p>
      )}
      <p className="saved-message" role="status">
        {message}
      </p>
      {savedLocations.length === 0 ? (
        <p className="empty-state">No Saved Locations yet.</p>
      ) : (
        <ul className="saved-list" aria-label="Saved Locations">
          {savedLocations.map((each) => (
            <SavedItem
              key={each.id}
              saved={each}
              modes={modes}
              onOpen={() => {
                onOpen(each);
              }}
              onRename={(next) => saved.rename(each.id, next)}
              onDelete={() => {
                saved.remove(each.id);
              }}
            />
          ))}
        </ul>
      )}
      <section className="saved-files" aria-labelledby="saved-files-heading">
        <h3 id="saved-files-heading">Export and import</h3>
        <button
          type="button"
          disabled={savedLocations.length === 0}
          onClick={() => {
            download(savedLocations);
          }}
        >
          Export as JSON
        </button>
        <label className="saved-import">
          Import from JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importFile(event);
            }}
          />
        </label>
        <p className="saved-note">
          Importing adds them to those saved here. One exported from here
          replaces itself, renamed or not.
        </p>
      </section>
    </aside>
  );
};
