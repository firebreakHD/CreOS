"use client";
import { Check } from "lucide-react";
export default function CompletionToggle({ checked,onChange,disabled = false,label = "Fertig" }: { checked: boolean; onChange: () => void; disabled?: boolean; label?: string }) {
  return <label className={`completion-toggle ${checked ? "is-complete" : ""} ${disabled ? "is-disabled" : ""}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange}/><span className="completion-check" aria-hidden="true">{checked && <Check size={24} strokeWidth={3}/>}</span><span>{label}</span></label>;
}
