import {
  AUTHORING_DESCRIPTORS,
  type AuthoringDescriptor,
  type HubToolStatus
} from '../app/authoringRegistry';

const statusCopy: Record<HubToolStatus, string> = {
  live: 'Available now',
  'shared-surface': 'Shared tool',
  foundation: 'Foundation',
  legacy: 'Read only'
};

const visibleTools = AUTHORING_DESCRIPTORS.filter((descriptor) => (
  descriptor.navigation && descriptor.id !== 'overview' && descriptor.id !== 'legacy'
));

function HubArrow() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
    </svg>
  );
}

function ToolCard({ descriptor }: { descriptor: AuthoringDescriptor }) {
  return (
    <a className="hub-tool-card" href={descriptor.path}>
      <span className="hub-tool-card__glyph" aria-hidden="true">{descriptor.glyph}</span>
      <span className="hub-tool-card__copy">
        <span className="hub-tool-card__meta">
          <small>{descriptor.eyebrow}</small>
          <em data-status={descriptor.status}>{statusCopy[descriptor.status]}</em>
        </span>
        <strong>{descriptor.label}</strong>
        <span>{descriptor.description}</span>
      </span>
      <span className="hub-tool-card__arrow" aria-hidden="true"><HubArrow /></span>
    </a>
  );
}

function QuickStartLink({
  href,
  number,
  title,
  description,
  external = false
}: {
  href: string;
  number: string;
  title: string;
  description: string;
  external?: boolean;
}) {
  return (
    <a
      className="hub-quick-link"
      href={href}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      <span>{number}</span>
      <div><strong>{title}</strong><small>{description}</small></div>
      <HubArrow />
    </a>
  );
}

export function HubOverview() {
  return (
    <div className="hub-overview">
      <section className="hub-hero" aria-labelledby="hub-overview-title">
        <div>
          <p>Scicon Shooter Control Center</p>
          <h1 id="hub-overview-title">Everything you need to pick the project back up.</h1>
          <span>
            Start here after a break. Review player reports, check where the code stands,
            open the game, or jump directly into the right authoring workshop.
          </span>
        </div>
        <dl aria-label="Control Center safety boundary">
          <div><dt>Working copy</dt><dd>Scicon Shooter / experimental</dd></div>
          <div><dt>Local game</dt><dd>127.0.0.1:5179 / mobile frame</dd></div>
          <div><dt>Safety boundary</dt><dd>Local only / no production writes</dd></div>
        </dl>
      </section>

      <section className="hub-overview__section hub-overview__section--quick" aria-labelledby="hub-quick-start-title">
        <header>
          <div>
            <p>Most useful shortcuts</p>
            <h2 id="hub-quick-start-title">Quick start</h2>
          </div>
          <a href="/project">Open the full Project Guide</a>
        </header>
        <div className="hub-quick-grid">
          <QuickStartLink href="/reports" number="01" title="Review reports" description="Bugs, feedback, and automatic crash context." />
          <QuickStartLink href="/bosses" number="02" title="Open Boss Sandbox" description="Build and fight bosses on the real game stage." />
          <QuickStartLink href="http://127.0.0.1:5179/?display=mobile-frame" number="03" title="Open local game" description="Use the shared experimental preview." external />
          <QuickStartLink href="/project" number="04" title="Check project status" description="Branch, changes, tool map, and restart checklist." />
        </div>
      </section>

      <section className="hub-return-plan" aria-labelledby="hub-return-title">
        <div>
          <p>Returning after a break?</p>
          <h2 id="hub-return-title">Use the same order every time.</h2>
        </div>
        <ol>
          <li><span>1</span><strong>Check status</strong><small>Know the branch and unfinished changes.</small></li>
          <li><span>2</span><strong>Read reports</strong><small>See what players found before planning work.</small></li>
          <li><span>3</span><strong>Open the game</strong><small>Confirm the current behavior yourself.</small></li>
          <li><span>4</span><strong>Choose a workshop</strong><small>Bosses, Missions, or Combat Lab.</small></li>
        </ol>
      </section>

      <section className="hub-overview__section" aria-labelledby="hub-tools-title">
        <header>
          <div>
            <p>Complete local tool map</p>
            <h2 id="hub-tools-title">All tools</h2>
          </div>
          <span>{visibleTools.length} stable routes</span>
        </header>
        <div className="hub-tool-grid">
          {visibleTools.map((descriptor) => <ToolCard key={descriptor.id} descriptor={descriptor} />)}
        </div>
      </section>

      <aside className="hub-workflow" aria-label="Recommended content workflow">
        <span>Idea</span><HubArrow />
        <span>Author</span><HubArrow />
        <span>Preview</span><HubArrow />
        <span>Sandbox</span><HubArrow />
        <span>Review</span><HubArrow />
        <span>Apply</span>
      </aside>
    </div>
  );
}
