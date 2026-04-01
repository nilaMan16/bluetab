import { useEffect, useState } from "react";
import QRCode from "qrcode";

type InviteCardProps = {
  inviteCode: string;
  tripTitle: string;
};

export function InviteCard({ inviteCode, tripTitle }: InviteCardProps) {
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    let active = true;

    QRCode.toDataURL(`BlueTab Group ID: ${inviteCode} | Trip: ${tripTitle}`, {
      width: 180,
      margin: 1,
      color: {
        dark: "#355c44",
        light: "#f9f3df"
      }
    }).then((url) => {
      if (active) {
        setDataUrl(url);
      }
    });

    return () => {
      active = false;
    };
  }, [inviteCode, tripTitle]);

  return (
    <div className="card invite-card">
      <div>
        <p className="eyebrow">Travel group</p>
        <h3>Share group ID</h3>
        <p className="muted">
          Share this group ID or QR so your friends can join the trip after signing in.
        </p>
      </div>
      <div className="invite-layout">
        <div>
          <div className="invite-code">{inviteCode}</div>
          <p className="helper">Friends can use this in the join group section.</p>
        </div>
        {dataUrl ? <img src={dataUrl} alt={`QR code for ${tripTitle}`} className="qr-code" /> : null}
      </div>
    </div>
  );
}
