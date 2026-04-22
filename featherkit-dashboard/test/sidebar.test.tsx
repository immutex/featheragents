import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Sidebar, type TabId } from '@/components/Sidebar';

const mockOnNav = vi.fn();
const mockOnSelectProject = vi.fn();

function renderSidebar(activeTab: TabId = 'home') {
  return render(
    <Sidebar
      activeTab={activeTab}
      onNav={mockOnNav}
      selectedProject="feather"
      onSelectProject={mockOnSelectProject}
      orchestratorStatus="running"
      pid={48231}
    />,
  );
}

describe('Sidebar', () => {
  beforeEach(() => {
    mockOnNav.mockClear();
    mockOnSelectProject.mockClear();
  });

  it('renders FeatherKit branding', () => {
    renderSidebar();
    expect(screen.getByText('FeatherKit')).toBeInTheDocument();
    expect(screen.getByText('v0.6.0')).toBeInTheDocument();
  });

  it('renders all main nav items', () => {
    renderSidebar();
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText('Connections')).toBeInTheDocument();
  });

  it('does not render Settings or theme toggle', () => {
    renderSidebar();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Dark')).not.toBeInTheDocument();
    expect(screen.queryByText('Light')).not.toBeInTheDocument();
  });

  it('renders orchestrator status', () => {
    renderSidebar();
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
    expect(screen.getByText(/running/)).toBeInTheDocument();
    expect(screen.getByText(/pid 48231/)).toBeInTheDocument();
  });

  it('calls onNav when Home is clicked', () => {
    renderSidebar('projects');
    fireEvent.click(screen.getByText('Home'));
    expect(mockOnNav).toHaveBeenCalledWith('home');
  });

  it('calls onNav when Agents is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByText('Agents'));
    expect(mockOnNav).toHaveBeenCalledWith('agents');
  });

  it('calls onNav when Memory is clicked', () => {
    renderSidebar();
    fireEvent.click(screen.getByText('Memory'));
    expect(mockOnNav).toHaveBeenCalledWith('memory');
  });

  it('expands projects dropdown when Projects is clicked', () => {
    renderSidebar();
    const projectsBtn = screen.getByText('Projects').closest('button')!;
    fireEvent.click(projectsBtn);
    expect(screen.getByText('feather-core')).toBeInTheDocument();
    expect(screen.getByText('api-gateway')).toBeInTheDocument();
  });

  it('shows only one orchestrator block', () => {
    const { container } = renderSidebar();
    const orchestratorBlocks = container.querySelectorAll('span.uppercase');
    const matching = Array.from(orchestratorBlocks).filter(el => el.textContent === 'Orchestrator');
    expect(matching.length).toBe(1);
  });
});
