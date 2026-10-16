"use client";

import { useState, FormEvent } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import ModalShell from "@/components/shared/ModalShell";
import { Equipment } from "@/lib/types";

interface ManageEquipmentModalProps {
  open: boolean;
  onClose: () => void;
  equipment: Equipment[];
  onChange: (next: Equipment[]) => void;
  onToast: (type: "success" | "error", message: string) => void;
}

/**
 * Minimal equipment catalog maintenance — the dropdown
 * on the usage log page is driven entirely by these
 * database rows, so this is the only place they change.
 */
export default function ManageEquipmentModal({
  open,
  onClose,
  equipment,
  onChange,
  onToast,
}: ManageEquipmentModalProps) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || adding) return;

    setAdding(true);
    try {
      const res = await fetch("/api/head/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json();

      if (!res.ok) {
        onToast("error", body.error || "Couldn't add the equipment.");
        return;
      }

      onChange([...equipment, body.equipment]);
      setName("");
      onToast("success", "Equipment added");
    } catch {
      onToast("error", "Couldn't add the equipment. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    if (removingId) return;
    setRemovingId(id);
    try {
      const res = await fetch("/api/head/equipment", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const body = await res.json();

      if (!res.ok) {
        // 409 — still referenced by usage records
        onToast("error", body.error || "Couldn't remove the equipment.");
        return;
      }

      onChange(equipment.filter((item) => item.id !== id));
      onToast("success", "Equipment removed");
    } catch {
      onToast("error", "Couldn't remove the equipment. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      ariaLabelledBy="manage-equipment-title"
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#E6EBF5] px-6 py-4 sm:px-7">
          <div>
            <h2
              id="manage-equipment-title"
              className="text-[16px] font-bold text-[#0F1B3D]"
            >
              Manage equipment
            </h2>
            <p className="mt-0.5 text-[12px] text-[#55617F]">
              Equipment that can be picked in the usage log.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="neu-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E6EBF5] text-[#94A3B8] transition-colors hover:border-[#CBD5E1] hover:text-[#0F1B3D]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="flex shrink-0 items-center gap-2 border-b border-[#E6EBF5] px-6 py-4 sm:px-7"
        >
          <label htmlFor="new-equipment-name" className="sr-only">
            Equipment name
          </label>
          <input
            id="new-equipment-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Drill press"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#E6EBF5] bg-white px-3.5 text-[13px] text-[#0F1B3D] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/30"
          />
          <button
            type="submit"
            disabled={adding || !name.trim()}
            className="neu-focus flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-4 text-[13px] font-semibold text-white transition-all hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            )}
            Add
          </button>
        </form>

        {/* List */}
        <div className="max-h-[40vh] overflow-y-auto px-6 py-3 sm:px-7">
          {equipment.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#55617F]">
              No equipment yet — add the first item above.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[#E6EBF5]">
              {equipment.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="min-w-0 truncate text-[13.5px] font-medium text-[#0F1B3D]">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.id)}
                    disabled={removingId !== null}
                    aria-label={`Remove ${item.name}`}
                    className="neu-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E6EBF5] text-[#94A3B8] transition-colors hover:border-[#FECACA] hover:bg-[#FEF2F2] hover:text-[#991B1B] disabled:opacity-50"
                  >
                    {removingId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end border-t border-[#E6EBF5] px-6 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="neu-focus h-11 rounded-xl bg-[#2563EB] px-5 text-[13px] font-semibold text-white transition-colors hover:bg-[#1D4ED8]"
          >
            Done
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
