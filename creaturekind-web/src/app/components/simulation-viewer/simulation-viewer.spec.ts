import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SimulationViewer } from './simulation-viewer';

describe('SimulationViewer', () => {
  let component: SimulationViewer;
  let fixture: ComponentFixture<SimulationViewer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimulationViewer],
    }).compileComponents();

    fixture = TestBed.createComponent(SimulationViewer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
