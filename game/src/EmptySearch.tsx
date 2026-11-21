import { Icon } from './ui';

export default function EmptySearch({ reset }: { reset: () => void }) {
  return (
    <div className="academy-empty">
      <Icon name="search" size={29}/>
      <p role="status">Natija topilmadi.</p>
      <button type="button" onClick={reset}>Qidiruvni tozalash</button>
    </div>
  );
}
