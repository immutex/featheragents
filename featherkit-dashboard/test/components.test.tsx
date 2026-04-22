import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Dot } from '@/components/ui/Dot';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Tabs, type TabDef } from '@/components/ui/Tabs';
import { PhaseDots } from '@/components/ui/PhaseDots';

describe('Badge', () => {
  it('renders with text content', () => {
    render(<Badge>active</Badge>);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('applies tone variant classes', () => {
    const { container } = render(<Badge tone="ok">ok</Badge>);
    const badge = container.firstElementChild!;
    expect(badge.className).toContain('bg-ok');
  });

  it('renders all tone variants without error', () => {
    const tones = ['default', 'accent', 'ok', 'warn', 'err', 'muted', 'frame', 'build', 'critic', 'sync'] as const;
    tones.forEach(tone => {
      const { unmount } = render(<Badge tone={tone}>{tone}</Badge>);
      expect(screen.getByText(tone)).toBeInTheDocument();
      unmount();
    });
  });
});

describe('Card', () => {
  it('renders children', () => {
    render(<Card>card content</Card>);
    expect(screen.getByText('card content')).toBeInTheDocument();
  });

  it('applies base card styles', () => {
    const { container } = render(<Card>test</Card>);
    const card = container.firstElementChild!;
    expect(card.className).toContain('bg-elevated');
    expect(card.className).toContain('border');
    expect(card.className).toContain('rounded-xl');
  });
});

describe('Button', () => {
  it('renders with text content', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('renders all variants without error', () => {
    const variants = ['default', 'accent', 'outline', 'ghost', 'danger'] as const;
    variants.forEach(variant => {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    });
  });
});

describe('Dot', () => {
  it('renders a dot element', () => {
    const { container } = render(<Dot tone="ok" size={5} />);
    const dot = container.firstElementChild!;
    expect(dot).toBeInTheDocument();
  });
});

describe('SectionLabel', () => {
  it('renders label text', () => {
    render(<SectionLabel>Projects</SectionLabel>);
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });
});

describe('Tabs', () => {
  const tabs: TabDef[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks', count: 5 },
    { id: 'chat', label: 'Chat', notify: true },
  ];

  it('renders all tab labels', () => {
    render(<Tabs tabs={tabs} active="overview" onChange={() => {}} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('renders count badge', () => {
    render(<Tabs tabs={tabs} active="overview" onChange={() => {}} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('calls onChange when tab is clicked', () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} active="overview" onChange={onChange} />);
    screen.getByText('Tasks').click();
    expect(onChange).toHaveBeenCalledWith('tasks');
  });
});

describe('PhaseDots', () => {
  it('renders four phase dots', () => {
    const { container } = render(<PhaseDots current="build" />);
    const dots = container.querySelectorAll('span');
    expect(dots.length).toBe(4);
  });

  it('renders without current phase', () => {
    const { container } = render(<PhaseDots />);
    const dots = container.querySelectorAll('span');
    expect(dots.length).toBe(4);
  });
});
