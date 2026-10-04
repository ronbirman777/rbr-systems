"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { classQrImagePath } from "@/lib/studio/publicLink";

/**
 * The class-registration QR - deliberately NOT the Space QR.
 *
 *   Space QR  opens the Guest App.
 *   Class QR  opens WhatsApp with this class's enquiry prefilled, to the
 *             number the teacher configured as this class's registration
 *             contact. The person still presses Send themselves.
 *
 * Only rendered for a class whose registration method is WhatsApp and
 * whose number is valid; the endpoint enforces the same rule again, so a
 * stale render can never produce a link.
 *
 * Collapsed by default: a teacher printing a flyer for one class wants
 * this, but it should not compete with the class's own fields.
 */
export function ClassWhatsAppQr({ tenantId, classId }: { tenantId: string; classId: string }) {
  const [open, setOpen] = useState(false);
  const src = classQrImagePath(tenantId, classId);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="self-start min-h-10 px-4 rounded-full border border-[#192B21]/20 text-[12.5px] font-semibold text-[#192B21]"
        data-testid="class-qr-toggle"
      >
        {open ? "Hide registration QR" : "Registration QR for this class"}
      </button>
      {open ? (
        <div className="flex flex-col sm:flex-row gap-4 items-start" data-testid="class-qr">
          <img
            src={src}
            alt="QR code that opens WhatsApp with this class's enquiry"
            width={132}
            height={132}
            className="block w-[132px] h-[132px] rounded-lg border border-[#E2DACD] bg-[#F3EFE7]"
          />
          <div className="flex flex-col gap-2 min-w-0">
            <p className="text-[12.5px] text-[#6F6C66] leading-relaxed max-w-[42ch]">
              Print this next to the class. Scanning it opens WhatsApp with the enquiry already written — your guest
              still presses Send.
            </p>
            <a
              href={src}
              download={`class-${classId.slice(0, 8)}-whatsapp-qr.png`}
              className="inline-flex items-center justify-center self-start min-h-10 px-4 rounded-full border border-[#192B21]/20 text-[12.5px] font-semibold text-[#192B21]"
            >
              Download QR
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
