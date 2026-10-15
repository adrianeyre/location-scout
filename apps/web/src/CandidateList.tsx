import type { GeocodeCandidate } from "@location-scout/shared";

interface CandidateListProps {
  candidates: GeocodeCandidate[];
  onChoose: (candidate: GeocodeCandidate) => void;
}

/** The addresses a search matched. Choosing one sets the Location (PRD FR-1.2). */
export const CandidateList = ({ candidates, onChoose }: CandidateListProps) => (
  <section className="candidate-list" aria-labelledby="candidates-heading">
    <h2 id="candidates-heading">Choose an address</h2>
    <p>
      {candidates.length} places match your search. Choose one to see its Search
      Area.
    </p>
    <ul>
      {candidates.map((candidate, index) => (
        // Two candidates can share a label, so the position keeps keys apart.
        <li key={`${String(index)} ${candidate.label}`}>
          <button
            type="button"
            onClick={() => {
              onChoose(candidate);
            }}
          >
            {candidate.label}
          </button>
        </li>
      ))}
    </ul>
  </section>
);
