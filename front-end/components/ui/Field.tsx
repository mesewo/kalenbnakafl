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
  const fieldID = id ?? generatedID;
  const describedBy = [hint && `${fieldID}-hint`, error && `${fieldID}-error`]
    .filter(Boolean)
    .join(" ");
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
    ? cloneElement(children, {
        id: children.props.id ?? fieldID,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
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
