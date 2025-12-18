import React from "react";

export default function AuthCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white shadow-lg rounded-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}
