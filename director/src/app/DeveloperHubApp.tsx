import {
  useEffect,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent
} from 'react';
import { AnalyticsFoundation } from '../tools/AnalyticsFoundation';
import { HubOverview } from '../tools/HubOverview';
import { PlayerReportInbox } from '../tools/PlayerReportInbox';
import { ProjectGuide } from '../tools/ProjectGuide';
import { WaveFormationGallery } from '../tools/wave-gallery/WaveFormationGallery';
import {
  AUTHORING_DESCRIPTORS,
  resolveHubRoute,
  type AuthoringDescriptor,
  type HubNavigationGroup,
  type HubToolStatus
} from './authoringRegistry';
import './hub-shell.css';

export interface DeveloperHubTools {
  MissionBuilder: ComponentType;
  BossSandbox: ComponentType;
  CombatLab: ComponentType;
  LegacyStudio: ComponentType;
}

export interface DeveloperHubAppProps {
  pathname?: string;
  tools: DeveloperHubTools;
}

const groupLabels: Record<HubNavigationGroup, string> = {
  hub: 'Hub',
  author: 'Author',
  test: 'Test',
  inspect: 'Inspect',
  archive: 'Archive'
};

const statusLabels: Record<HubToolStatus, string> = {
  live: 'Available',
  'shared-surface': 'Shared surface',
  foundation: 'Foundation',
  legacy: 'Read only'
};

const navigationGroups = (['hub', 'author', 'test', 'inspect', 'archive'] as const)
  .map((group) => ({
    group,
    descriptors: AUTHORING_DESCRIPTORS.filter((descriptor) => descriptor.navigation && descriptor.group === group)
  }))
  .filter(({ descriptors }) => descriptors.length > 0);

function HubMark() {
  return (
    <svg viewBox="0 0 38 38" aria-hidden="true">
      <path d="M19 3 32.5 10.8v16L19 34.5 5.5 26.8v-16L19 3Z" />
      <path d="m13 13 6-3.5 6 3.5v8l-6 3.5-6-3.5v-8Zm6-3.5v15M13 13l12 8m0-8-12 8" />
    </svg>
  );
}

function HubNavigation({ active }: { active: AuthoringDescriptor['id'] }) {
  return (
    <nav className="hub-nav" aria-label="Scicon Shooter Control Center tools">
      {navigationGroups.map(({ group, descriptors }) => (
        <div className="hub-nav__group" key={group}>
          <p>{groupLabels[group]}</p>
          <div>
            {descriptors.map((descriptor) => (
              <a
                href={descriptor.path}
                key={descriptor.id}
                aria-current={descriptor.id === active ? 'page' : undefined}
                title={descriptor.description}
              >
                <span aria-hidden="true">{descriptor.glyph}</span>
                <strong>{descriptor.shortLabel}</strong>
                {descriptor.status === 'shared-surface'
                  ? <i title={statusLabels[descriptor.status]} />
                  : null}
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function MissionBuilderHost({
  Component,
  requiredSurface
}: {
  Component: ComponentType;
  requiredSurface?: 'review';
}) {
  const [ready, setReady] = useState(() => {
    if (!requiredSurface) return true;
    return new URLSearchParams(window.location.search).get('surface') === requiredSurface;
  });

  useEffect(() => {
    if (!requiredSurface || ready) return;
    const url = new URL(window.location.href);
    url.searchParams.set('surface', requiredSurface);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    setReady(true);
  }, [ready, requiredSurface]);

  if (!ready) {
    return <div className="hub-tool-loading" role="status">Opening the review surface...</div>;
  }
  return <Component />;
}

const mutationSelector = 'button, input, select, textarea, [contenteditable="true"]';

function LegacyReadOnlyHost({ Component }: { Component: ComponentType }) {
  const stopLegacyMutation = (
    event: ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>
  ) => {
    const target = event.target instanceof Element ? event.target.closest(mutationSelector) : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="hub-tool-stack">
      <aside className="hub-legacy-notice" id="hub-legacy-notice">
        <strong>Legacy / read-only</strong>
        <span>
          This superseded Studio remains visible as a migration reference. Use Missions,
          Waves, Reviews, and the Sandbox for active work.
        </span>
      </aside>
      <div
        className="hub-tool-frame hub-tool-frame--legacy hub-tool-frame--readonly"
        aria-describedby="hub-legacy-notice"
        onClickCapture={stopLegacyMutation}
        onKeyDownCapture={stopLegacyMutation}
      >
        <Component />
      </div>
    </div>
  );
}

function MissingRoute({ requestedPath }: { requestedPath: string }) {
  return (
    <section className="hub-missing-route" aria-labelledby="hub-missing-title">
      <span>404 / Local route</span>
      <h1 id="hub-missing-title">That Control Center tool is not registered.</h1>
      <p>
        <code>{requestedPath}</code> is not in the local authoring registry.
        Choose a stable tool route from the navigation.
      </p>
      <a href="/">Return to Control Center</a>
    </section>
  );
}

export function DeveloperHubApp({
  pathname = window.location.pathname,
  tools
}: DeveloperHubAppProps) {
  const route = resolveHubRoute(pathname);
  const { descriptor } = route;

  if (!route.notFound && descriptor.host === 'boss-sandbox') {
    return <tools.BossSandbox />;
  }

  let content;
  if (route.notFound) {
    content = <MissingRoute requestedPath={route.requestedPath} />;
  } else {
    switch (descriptor.host) {
      case 'mission-builder':
        content = (
          <div className="hub-tool-frame">
            <MissionBuilderHost
              Component={tools.MissionBuilder}
              requiredSurface={'requiredQuerySurface' in descriptor
                ? descriptor.requiredQuerySurface
                : undefined}
            />
          </div>
        );
        break;
      case 'combat-lab':
        content = <div className="hub-tool-frame"><tools.CombatLab /></div>;
        break;
      case 'analytics-foundation':
        content = <AnalyticsFoundation />;
        break;
      case 'report-inbox':
        content = <PlayerReportInbox />;
        break;
      case 'wave-gallery':
        content = <WaveFormationGallery />;
        break;
      case 'project-guide':
        content = <ProjectGuide />;
        break;
      case 'legacy':
        content = <LegacyReadOnlyHost Component={tools.LegacyStudio} />;
        break;
      default:
        content = <HubOverview />;
    }
  }

  const scrollable = route.notFound
    || descriptor.host === 'overview'
    || descriptor.host === 'analytics-foundation'
    || descriptor.host === 'report-inbox'
    || descriptor.host === 'wave-gallery'
    || descriptor.host === 'project-guide';

  return (
    <div className="hub-shell" data-hub-route={descriptor.id}>
      <header className="hub-header">
        <a className="hub-brand" href="/" aria-label="Scicon Shooter Control Center home">
          <span><HubMark /></span>
          <strong>Scicon Control Center</strong>
        </a>
        <div className="hub-route-context">
          <small>{descriptor.eyebrow}</small>
          <strong>{route.notFound ? 'Unknown tool' : descriptor.label}</strong>
          {route.isAlias ? <em>Compatibility route</em> : null}
        </div>
        <div className="hub-local-status" title="Loopback-only Director on 127.0.0.1:5174">
          <i aria-hidden="true" />
          <span>Local only</span>
          <small>127.0.0.1:5174</small>
        </div>
        <span className="hub-route-status" data-status={descriptor.status}>
          {statusLabels[descriptor.status]}
        </span>
      </header>

      <aside className="hub-rail">
        <HubNavigation active={descriptor.id} />
        <footer>
          <i aria-hidden="true" />
          <span>No chain<br />No production writes</span>
        </footer>
      </aside>

      <main className={`hub-main${scrollable ? ' hub-main--scrollable' : ''}`}>
        {content}
      </main>
    </div>
  );
}
