import { SearchIcon } from './Icons';
import { Input, type InputProps } from './Input';

export type SearchInputProps = Omit<InputProps, 'type' | 'label' | 'hint' | 'error'> & {
  'aria-label': string;
};

export function SearchInput({
  className = '',
  placeholder = 'Поиск...',
  ...props
}: SearchInputProps) {
  return (
    <div className="relative w-full">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-text-secondary" />
      <Input
        {...props}
        type="search"
        placeholder={placeholder}
        className={['pl-12', className].join(' ')}
      />
    </div>
  );
}
