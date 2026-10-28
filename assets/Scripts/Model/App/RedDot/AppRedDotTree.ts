import { RedDot } from '../../../Frame/RedDot/RedDot';

export const appRedDotId = {
    main: 'main',
    team: 'main/team',
    stage: 'main/stage',
    setting: 'main/setting',
} as const;

export function registerAppRedDots(): void {
    RedDot.Batch(() => {
        RedDot.Register(appRedDotId.main);
        RedDot.Register(appRedDotId.team, appRedDotId.main);
        RedDot.Register(appRedDotId.stage, appRedDotId.main);
        RedDot.Register(appRedDotId.setting, appRedDotId.main);
    });
}