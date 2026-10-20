import { chart } from '../storage/store';

/** <optgroup>s of the chart's actions, one group per pillar, for any action picker. */
export function ActionOptionGroups({
  value = (id) => id,
  includeRetired = false,
  alsoInclude,
}: {
  value?: (actionId: string) => string;
  includeRetired?: boolean;
  /** A retired action to keep selectable (e.g. one a task is still linked to). */
  alsoInclude?: string;
}) {
  const c = chart.value;
  const retired = c.archive.filter((a) => includeRetired || a.id === alsoInclude);
  return (
    <>
      {c.pillars.map((p) => (
        <optgroup key={p.id} label={p.title}>
          {p.actions
            .filter((a) => a.text.trim())
            .map((a) => (
              <option key={a.id} value={value(a.id)}>
                {a.text}
              </option>
            ))}
        </optgroup>
      ))}
      {retired.length > 0 && (
        <optgroup label="Replaced actions">
          {retired.map((a) => (
            <option key={a.id} value={value(a.id)}>
              {a.text}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
