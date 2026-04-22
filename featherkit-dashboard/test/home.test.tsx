import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeView } from '@/views/Home';
import type { TabId } from '@/components/Sidebar';

const mockOnNav = vi.fn();

describe('HomeView', () => {
  beforeEach(() => {
    mockOnNav.mockClear();
  });

  it('renders the Dashboard heading', () => {
    render(<HomeView onNav={mockOnNav} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows agent input warning when pending inputs exist', () => {
    render(<HomeView onNav={mockOnNav} />);
    expect(screen.getByText('Agent needs input')).toBeInTheDocument();
  });

  it('shows task counters', () => {
    render(<HomeView onNav={mockOnNav} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows activity feed', () => {
    render(<HomeView onNav={mockOnNav} />);
    expect(screen.getByText('Activity')).toBeInTheDocument();
  });

  it('shows queue section', () => {
    render(<HomeView onNav={mockOnNav} />);
    expect(screen.getByText('Queue')).toBeInTheDocument();
  });

  it('shows active task details', () => {
    render(<HomeView onNav={mockOnNav} />);
    expect(screen.getByText('build phase')).toBeInTheDocument();
  });
});
