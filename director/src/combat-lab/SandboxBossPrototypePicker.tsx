import {
  SANDBOX_BOSS_PROTOTYPES,
  type SandboxBossPrototypeId
} from './sandboxBossPrototypes';

interface SandboxBossPrototypePickerProps {
  activePrototypeId: SandboxBossPrototypeId | null;
  onSelect(prototypeId: SandboxBossPrototypeId): void;
}

const shortHash = (value: string) => value.slice(value.indexOf(':') + 1, value.indexOf(':') + 9);

export function SandboxBossPrototypePicker({
  activePrototypeId,
  onSelect
}: SandboxBossPrototypePickerProps) {
  return (
    <section
      className="cl-sandbox-prototypes"
      aria-labelledby="sandbox-boss-prototypes-heading"
      data-sandbox-only="true"
    >
      <header>
        <div>
          <p>Frozen Director definitions</p>
          <strong id="sandbox-boss-prototypes-heading">Boss prototypes</strong>
        </div>
        <span>Sandbox only</span>
      </header>
      <div className="cl-sandbox-prototypes__list">
        {SANDBOX_BOSS_PROTOTYPES.map((prototype) => (
          <button
            key={prototype.id}
            className={activePrototypeId === prototype.id ? 'is-selected' : ''}
            type="button"
            aria-pressed={activePrototypeId === prototype.id}
            onClick={() => onSelect(prototype.id)}
            title={prototype.description}
          >
            <span>
              <strong>{prototype.shortLabel}</strong>
              <em>#{shortHash(prototype.prototypeHash)}</em>
            </span>
            <small>{prototype.designIntent[0]}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
