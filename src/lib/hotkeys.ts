"use client";

import { useEffect, useRef } from "react";

/**
 * Keyboard-first shortcut layer.
 *
 * Combos: "n", "shift+n", "mod+enter" (⌘ on Mac, Ctrl elsewhere), "alt+1", "?", "/",
 * and two-key sequences such as "g b" (press g, then b within 1.2 s).
 *
 * Rules:
 * - Single-key shortcuts never fire while the user types in a field.
 *   Combos with mod/alt do fire in fields only when `allowInInput` is set.
 * - While a dialog is open, only shortcuts whose target sits inside that dialog fire
 *   (`scope` element), so page shortcuts never act behind a modal.
 */

export type HotkeyOptions = {
  enabled?: boolean;
  allowInInput?: boolean;
  /** Element the shortcut belongs to; used to decide dialog scope. */
  scope?: () => HTMLElement | null;
};

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const el = target;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
  }
  return el.getAttribute("role") === "combobox" || el.getAttribute("role") === "textbox";
}

function openDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]')).filter(el => el.offsetParent !== null || el.getClientRects().length > 0);
  return dialogs.at(-1) ?? null;
}

function normaliseKey(key: string) {
  const k = key.toLowerCase();
  if (k === "esc") return "escape";
  if (k === "return") return "enter";
  return k;
}

type Parsed = { key: string; mod: boolean; shift: boolean; alt: boolean };
function parseCombo(combo: string): Parsed {
  const parts = combo.toLowerCase().split("+");
  const key = normaliseKey(parts.pop() ?? "");
  return { key, mod: parts.includes("mod"), shift: parts.includes("shift"), alt: parts.includes("alt") };
}

function eventKey(event: KeyboardEvent) {
  // Use the physical digit for alt+digit (macOS Option turns 1 into ¡).
  if (event.altKey && /^Digit\d$/.test(event.code)) return event.code.slice(5);
  if (event.altKey && /^Key[A-Z]$/.test(event.code)) return event.code.slice(3).toLowerCase();
  return normaliseKey(event.key);
}

function matches(parsed: Parsed, event: KeyboardEvent) {
  const mod = isMac() ? event.metaKey : event.ctrlKey;
  if (parsed.mod !== mod) return false;
  if (parsed.alt !== event.altKey) return false;
  const key = eventKey(event);
  // "?" and other shifted symbols arrive with shiftKey already set.
  const symbol = key.length === 1 && !/[a-z0-9]/.test(key);
  if (!symbol && parsed.shift !== event.shiftKey) return false;
  return parsed.key === key;
}

let pendingPrefix: { key: string; at: number } | null = null;
/** The keydown that completes a sequence, tagged in the capture phase so single-key shortcuts ignore it. */
let sequenceEvent: { event: KeyboardEvent; prefix: string } | null = null;

export function useHotkey(combo: string | undefined | false, handler: (event: KeyboardEvent) => void, options: HotkeyOptions = {}) {
  const handlerRef = useRef(handler);
  const optionsRef = useRef(options);
  useEffect(() => { handlerRef.current = handler; optionsRef.current = options; });
  const enabled = options.enabled ?? true;
  useEffect(() => {
    if (!combo || !enabled) return;
    const sequence = combo.trim().split(/\s+/);
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const { allowInInput, scope } = optionsRef.current;
      const typing = isTypingTarget(event.target);
      const last = parseCombo(sequence.at(-1)!);
      if (typing && !(allowInInput && (last.mod || last.alt))) return;
      const dialog = openDialog();
      if (dialog) {
        const owner = scope?.();
        if (!owner || !dialog.contains(owner)) return;
      }
      const inSequence = sequenceEvent?.event === event;
      if (sequence.length === 2) {
        const first = parseCombo(sequence[0]);
        if (inSequence && sequenceEvent!.prefix === first.key && matches(last, event)) {
          event.preventDefault();
          handlerRef.current(event);
        }
        return;
      }
      if (inSequence) return;
      if (matches(last, event)) {
        event.preventDefault();
        handlerRef.current(event);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [combo, enabled]);
}

/** Records sequence prefixes ("g") so two-key shortcuts work. Mount once in the app shell. */
export function useSequencePrefixes(prefixes: string[]) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target) || openDialog()) return;
      const key = normaliseKey(event.key);
      if (pendingPrefix && Date.now() - pendingPrefix.at < 1200 && !prefixes.includes(key)) {
        sequenceEvent = { event, prefix: pendingPrefix.key };
        pendingPrefix = null;
        return;
      }
      pendingPrefix = prefixes.includes(key) ? { key, at: Date.now() } : null;
    };
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, [prefixes]);
}

/** Human label for a combo: "mod+enter" → ["⌘", "↵"] on Mac, ["Ctrl", "↵"] elsewhere. */
export function comboLabel(combo: string): string[] {
  return combo.trim().split(/\s+/).flatMap((step, index, all) => {
    const keys = step.split("+").map(part => {
      const p = part.toLowerCase();
      if (p === "mod") return isMac() ? "⌘" : "Ctrl";
      if (p === "alt") return isMac() ? "⌥" : "Alt";
      if (p === "shift") return "⇧";
      if (p === "enter") return "↵";
      if (p === "escape" || p === "esc") return "Esc";
      if (p === "arrowup") return "↑";
      if (p === "arrowdown") return "↓";
      return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
    });
    void all; void index;
    return keys;
  });
}
