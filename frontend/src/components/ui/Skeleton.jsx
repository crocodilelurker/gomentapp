import React from 'react';

export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-[#17234d]/10 ${className}`}
      {...props}
    />
  );
}

