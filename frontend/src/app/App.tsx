import { ThemeToggle } from '@/features/theme';
import { Button, IconButton, Input, Logo, SearchInput } from '@/shared';

function App() {
  return (
    <div className="flex flex-col gap-5">
      <Logo />
      <ThemeToggle />
      <div className="flex items-center gap-5">
        <Button variant="primary" size="medium">
          Основная кнопка
        </Button>
        <Button variant="secondary" size="medium">
          Вторичная кнопка
        </Button>
        <Button variant="ghost" size="medium">
          Прозрачная кнопка
        </Button>
        <Button size="small">Small</Button>
        <Button size="medium">Medium</Button>
        <Button size="large">Large</Button>
        <Button disabled>Disabled</Button>
      </div>

      <div>
        <IconButton aria-label="Открыть меню" variant="ghost">
          <span aria-hidden="true">☰</span>
        </IconButton>

        <IconButton aria-label="Маленькая кнопка" size="small">
          <span aria-hidden="true">×</span>
        </IconButton>

        <IconButton aria-label="Средняя кнопка" size="medium">
          <span aria-hidden="true">×</span>
        </IconButton>

        <IconButton aria-label="Большая кнопка" size="large">
          <span aria-hidden="true">×</span>
        </IconButton>
      </div>

      <div>
        <Input label="Имя пользователя" placeholder="Введите имя пользователя" />
      </div>

      <div>
        <SearchInput aria-label="Поиск фильмов" placeholder="Введите название фильма" />
      </div>
    </div>
  );
}

export default App;
