"use client";

import Image from "next/image";
import { useState } from "react";

type UserAvatarProps = {
  userId?: string | null;
  avatarSeed?: string | null;
  displayName?: string | null;
  size?: number;
  className?: string;
};

export function UserAvatar({ userId, avatarSeed, displayName, size = 40, className = "" }: UserAvatarProps) {
  const objectId = /^upload:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(avatarSeed ?? "")?.[1];
  const imageUrl = userId && objectId ? `/api/v1/account/avatar/${encodeURIComponent(userId)}?v=${objectId}` : null;
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl && failedImageUrl !== imageUrl);
  const initial = displayName?.trim().slice(0, 1).toLocaleUpperCase() || "N";

  return (
    <span
      role="img"
      aria-label={`${displayName?.trim() || "使用者"}的個人頭像`}
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#7c5cff] to-[#20c5e8] font-bold text-white shadow-sm ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage && imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          sizes={`${size}px`}
          unoptimized
          className="h-full w-full rounded-full object-cover"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      ) : (
        <span aria-hidden="true" className="select-none leading-none">{initial}</span>
      )}
    </span>
  );
}
