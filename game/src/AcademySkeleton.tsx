export default function AcademySkeleton({ label, layout = 'cards' }: {
  label: string;
  layout?: 'cards' | 'lesson';
}) {
  return (
    <div className={'academy-skeleton skeleton-' + layout} role="status">
      <span className="skeleton-label"><i aria-hidden="true"/>{label}</span>
      <div className="skeleton-layout" aria-hidden="true">
        <div className="skeleton-feature"><i/><i/><i/></div>
        {Array.from({ length: layout === 'lesson' ? 1 : 3 }, (_, index) => (
          <div className="skeleton-tile" key={index}><i/><i/><i/></div>
        ))}
      </div>
    </div>
  );
}
