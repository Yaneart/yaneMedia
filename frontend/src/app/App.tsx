import { ThemeToggle } from '@/features/theme';
import { Button, Logo } from '@/shared';

function App() {
  return (
    <div>
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
    </div>
  );
}

export default App;
