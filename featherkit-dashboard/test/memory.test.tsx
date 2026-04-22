import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryView } from '@/views/Memory';

describe('MemoryView', () => {
  it('renders the Memory Graph heading', () => {
    render(<MemoryView />);
    expect(screen.getByText('Memory Graph')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    render(<MemoryView />);
    const searchInput = screen.getByPlaceholderText('Search memories...');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders type filter', () => {
    render(<MemoryView />);
    expect(screen.getByText('Type:')).toBeInTheDocument();
  });

  it('renders scope filter', () => {
    render(<MemoryView />);
    expect(screen.getByText('Scope:')).toBeInTheDocument();
  });

  it('renders reset button', () => {
    render(<MemoryView />);
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });

  it('renders memory type counts', () => {
    render(<MemoryView />);
    expect(screen.getByText('Memory System')).toBeInTheDocument();
  });

  it('search icon does not overlap placeholder text', () => {
    const { container } = render(<MemoryView />);
    const inputWrapper = screen.getByPlaceholderText('Search memories...').parentElement!;
    const icon = container.querySelector('.pointer-events-none')!;
    expect(icon).toBeInTheDocument();
    const input = screen.getByPlaceholderText('Search memories...');
    expect(input.className).toContain('pl-9');
  });
});
