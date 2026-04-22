import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '@/App';

const originalError = console.error;

describe('App', () => {
  beforeEach(() => {
    console.error = vi.fn();
    localStorage.clear();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('renders the app shell with sidebar and main content', () => {
    const { container } = render(<App />);
    const aside = container.querySelector('aside');
    const main = container.querySelector('main');
    expect(aside).toBeInTheDocument();
    expect(main).toBeInTheDocument();
  });

  it('shows Dashboard heading by default', () => {
    render(<App />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('has all navigation items in sidebar', () => {
    render(<App />);
    expect(screen.getByText('FeatherKit')).toBeInTheDocument();
    expect(screen.getAllByText('Home').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getAllByText('Agents').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Memory').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Connections').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render settings or theme toggle', () => {
    render(<App />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Dark')).not.toBeInTheDocument();
  });

  it('navigates to Agents view when clicked', async () => {
    render(<App />);
    const agentBtns = screen.getAllByText('Agents');
    fireEvent.click(agentBtns[0]);
    await waitFor(() => {
      const allAgents = screen.getAllByText('Agents');
      expect(allAgents.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('persists tab to localStorage on nav', () => {
    render(<App />);
    const memoryBtns = screen.getAllByText('Memory');
    fireEvent.click(memoryBtns[0]);
    const stored = JSON.parse(localStorage.getItem('fk_state_v2') || '{}');
    expect(stored.activeTab).toBe('memory');
  });

  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container.innerHTML).toContain('FeatherKit');
  });
});
