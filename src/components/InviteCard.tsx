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

    QRCode.toDataURL(`Trip invite: ${tripTitle} | Code: ${inviteCode}`, {
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
        <p className="eyebrow">Travel group invite</p>
        <h3>Share by code or QR</h3>
        <p className="muted">
          Send this to a friend so they can join the trip after signing in.
        </p>
      </div>
      <div className="invite-layout">
        <div>
          <div className="invite-code">{inviteCode}</div>
          <p className="helper">Use this code inside the join panel.</p>
        </div>
        {dataUrl ? <img src={dataUrl} alt={`QR code for ${tripTitle}`} className="qr-code" /> : null}
      </div>
    </div>
  );
}
