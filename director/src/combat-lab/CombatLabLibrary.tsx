import type {
  CombatLabCatalog,
  CombatLabCatalogItem,
  CombatLabCategoryId
} from './contentCatalog';

interface CombatLabLibraryProps {
  catalog: CombatLabCatalog;
  categoryId: CombatLabCategoryId;
  search: string;
  selectedItemId: string | null;
  onCategoryChange: (categoryId: CombatLabCategoryId) => void;
  onSearchChange: (search: string) => void;
  onSelect: (item: CombatLabCatalogItem) => void;
}

const CATEGORY_GLYPHS: Record<CombatLabCategoryId, string> = {
  formations: 'F',
  enemies: 'E',
  bosses: 'B',
  'boss-moves': 'M',
  'stages-waves': 'W',
  'main-ships': 'S',
  'mini-ships': 'm',
  weapons: 'X',
  powerups: 'P',
  'effects-assets': 'A'
};

const displayFact = (value: CombatLabCatalogItem['facts'][number]['value']) => (
  Array.isArray(value) ? value.slice(0, 3).join(', ') || 'None' : String(value)
);

export function CombatLabLibrary({
  catalog,
  categoryId,
  search,
  selectedItemId,
  onCategoryChange,
  onSearchChange,
  onSelect
}: CombatLabLibraryProps) {
  const category = catalog.categories.find((item) => item.id === categoryId) ?? catalog.categories[0];
  const normalizedSearch = search.trim().toLowerCase();
  const items = category.items.filter((item) => !normalizedSearch || [
    item.name,
    item.description,
    item.kind,
    ...item.facts.flatMap((fact) => [fact.label, displayFact(fact.value)])
  ].some((value) => value.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="cl-library">
      <label className="cl-search">
        <span aria-hidden="true">⌕</span>
        <input value={search} onChange={(input) => onSearchChange(input.target.value)} placeholder="Search real game content" aria-label="Search Combat Lab content" />
        {search ? <button type="button" onClick={() => onSearchChange('')} aria-label="Clear search">×</button> : null}
      </label>

      <nav className="cl-category-list" aria-label="Combat Lab library categories">
        {catalog.categories.map((item) => (
          <button
            type="button"
            key={item.id}
            className={item.id === category.id ? 'is-selected' : ''}
            onClick={() => onCategoryChange(item.id)}
          >
            <i>{CATEGORY_GLYPHS[item.id]}</i>
            <span>{item.label}</span>
            <small>{item.items.length}</small>
          </button>
        ))}
      </nav>

      <div className="cl-library-heading">
        <div><p>Browse</p><strong>{category.label}</strong></div>
        <span>{items.length} shown</span>
      </div>

      <div className="cl-card-list">
        {items.map((item) => {
          const imagePath = item.imagePaths[0];
          return (
            <button
              type="button"
              key={item.id}
              className={`cl-content-card${item.id === selectedItemId ? ' is-selected' : ''}`}
              onClick={() => onSelect(item)}
            >
              <span className="cl-content-card__art">
                {imagePath ? <img src={imagePath} alt="" loading="lazy" /> : <i>{CATEGORY_GLYPHS[item.category]}</i>}
              </span>
              <span className="cl-content-card__copy">
                <span><strong>{item.name}</strong><em>{item.production ? 'Available' : 'Supported'}</em></span>
                <small>{item.description}</small>
                <span className="cl-content-card__facts">
                  {item.facts.slice(0, 2).map((fact) => <span key={fact.label}><b>{fact.label}</b>{displayFact(fact.value)}</span>)}
                </span>
              </span>
            </button>
          );
        })}
        {items.length === 0 ? <p className="cl-no-results">No {category.label.toLowerCase()} match “{search}”.</p> : null}
      </div>
    </div>
  );
}

export default CombatLabLibrary;
