import { cloneElement, isValidElement, useId, type ReactNode } from "react";

export default function Field({
  id,
  label,
  hint,
  error,
  children,
  className = "",
}: {
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const generatedID = useId();
  const validControl = isValidElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean | "true" | "false";
  }>(children);
  const fieldID = id ?? (validControl ? children.props.id : undefined) ?? generatedID;
  const describedBy = [
    validControl ? children.props["aria-describedby"] : undefined,
    hint && `${fieldID}-hint`,
    error && `${fieldID}-error`,
  ]
    .filter(Boolean)
    .join(" ");
  const control = validControl
    ? cloneElement(children, {
        id: fieldID,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })
    : children;

  return (
    <div className={`field ${className}`.trim()}>
      <label htmlFor={fieldID}>{label}</label>
      {control}
      {hint && <small id={`${fieldID}-hint`}>{hint}</small>}
      {error && (
        <small id={`${fieldID}-error`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
