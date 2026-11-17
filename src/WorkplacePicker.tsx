import { displayName, type Workplace } from './lib/storage';

type Props = {
  workplaces: Workplace[];
  value: string;
  onChange: (id: string) => void;
};

// 勤務先が1つのときは何も出さない
export default function WorkplacePicker({ workplaces, value, onChange }: Props) {
  if (workplaces.length < 2) return null;

  return (
    <div className="picker" role="group" aria-label="勤務先">
      {workplaces.map((w, i) => (
        <button
          key={w.id}
          type="button"
          aria-pressed={w.id === value}
          onClick={() => onChange(w.id)}
        >
          {displayName(w, i)}
        </button>
      ))}
    </div>
  );
}
