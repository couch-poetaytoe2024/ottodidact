import { screen, type Display } from 'electron';

let activeId:number|undefined;
export function activeDisplay():Display {
  return screen.getAllDisplays().find(display=>display.id===activeId)??screen.getPrimaryDisplay();
}
export function useDisplay(id:number) {
  activeId=screen.getAllDisplays().find(display=>display.id===id)?.id??screen.getPrimaryDisplay().id;
  return activeDisplay();
}
