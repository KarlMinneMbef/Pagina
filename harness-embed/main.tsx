import React from "react";
import ReactDOM from "react-dom/client";
import { PaginaLight } from "../src/embed";
import exemple from "./rapport-exemple.md?raw";

// Journal des événements pour le script de test (scripts/test-embed.mjs).
declare global { interface Window { __journal: string[]; __dernierMarkdown: string | null } }
window.__journal = [];
window.__dernierMarkdown = null;

function Banc() {
  const [lectureSeule, setLectureSeule] = React.useState(false);
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <label style={{ display: "block", marginBottom: 8 }}>
        <input id="lecture-seule" type="checkbox" checked={lectureSeule} onChange={(e) => setLectureSeule(e.target.checked)} /> lecture seule
      </label>
      <PaginaLight
        value={exemple}
        documentTitle="2026-09_CompteRenduMensuel.md"
        height={640}
        readOnly={lectureSeule}
        onChange={(md) => { window.__journal.push("change: " + String(new Error().stack).split(String.fromCharCode(10)).slice(2, 7).map((x) => x.trim().slice(0, 90)).join(" <- ")); window.__dernierMarkdown = md; }}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("racine") as HTMLElement).render(<Banc />);
