interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export default function ToggleSwitch({ checked, onChange, label }: ToggleSwitchProps) {
  return (
    <label className="flex items-center space-x-3 cursor-pointer select-none">
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`block w-12 h-6 rounded-full transition-colors ${
            checked ? 'bg-primary-600' : 'bg-gray-300'
          }`}
        />
        <div
          className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${
            checked ? 'transform translate-x-6' : ''
          }`}
        />
      </div>
      {label && (
        <span className={`text-sm font-medium select-none ${
          checked ? 'text-primary-600' : 'text-gray-700'
        }`}>
          {label}
        </span>
      )}
    </label>
  );
}
