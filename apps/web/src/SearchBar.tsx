import { useState, type SubmitEvent } from "react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  busy: boolean;
}

export const SearchBar = ({ onSearch, busy }: SearchBarProps) => {
  const [query, setQuery] = useState("");

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form className="search-bar" role="search" onSubmit={submit}>
      <label htmlFor="search-query">Postcode or address</label>
      <div className="search-field">
        <svg
          className="search-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          id="search-query"
          name="q"
          type="search"
          placeholder="e.g. NG17 1AA or 12 High Street, Sutton-in-Ashfield"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <button type="submit" disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? "Searching…" : "Search"}
        </button>
      </div>
    </form>
  );
};
