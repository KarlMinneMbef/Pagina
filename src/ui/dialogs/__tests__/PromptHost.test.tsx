import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PromptHost } from "../PromptHost";
import { askText, askForm } from "../promptStore";
import { askNewFileName, askCrossReference } from "../prompts";

describe("dialogues de saisie (remplacent window.prompt)", () => {
  it("askText : Entrée valide et renvoie le texte saisi", async () => {
    render(<PromptHost />);
    const promise = askText({ title: "Test", label: "Valeur :", initial: "abc" });
    const input = (await screen.findByRole("dialog")).querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("abc");
    fireEvent.change(input, { target: { value: "xyz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await promise).toBe("xyz");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Échap et « Annuler » renvoient null", async () => {
    render(<PromptHost />);
    const p1 = askText({ title: "A", label: "x" });
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(await p1).toBeNull();
    const p2 = askText({ title: "B", label: "x" });
    fireEvent.click(await screen.findByText("Annuler"));
    expect(await p2).toBeNull();
  });

  it("une validation refusée garde le dialogue ouvert avec son message", async () => {
    render(<PromptHost />);
    const promise = askNewFileName();
    const dialog = await screen.findByRole("dialog");
    const input = dialog.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a/b.md" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((await screen.findByRole("alert")).textContent).toContain("Caractères interdits");
    fireEvent.change(input, { target: { value: "ok.md" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await promise).toBe("ok.md");
  });

  it("renvoi : propose les signets existants et rend le signet visé + le texte", async () => {
    render(<PromptHost />);
    const promise = askCrossReference(["intro", "annexe"]);
    const dialog = await screen.findByRole("dialog");
    const inputs = dialog.querySelectorAll("input");
    expect((inputs[0] as HTMLInputElement).value).toBe("intro");
    expect(dialog.querySelectorAll("datalist option")).toHaveLength(2);
    fireEvent.change(inputs[1], { target: { value: "voir l'annexe" } });
    fireEvent.change(inputs[0], { target: { value: "annexe" } });
    fireEvent.click(screen.getByText("Insérer"));
    expect(await promise).toEqual({ target: "annexe", label: "voir l'annexe" });
  });

  it("une nouvelle demande annule celle qui était ouverte", async () => {
    render(<PromptHost />);
    const first = askForm({ title: "1", okLabel: "OK", fields: [{ key: "a", label: "a" }] });
    await screen.findByRole("dialog");
    const second = askText({ title: "2", label: "b" });
    expect(await first).toBeNull();
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
    expect(await second).toBeNull();
  });
});
