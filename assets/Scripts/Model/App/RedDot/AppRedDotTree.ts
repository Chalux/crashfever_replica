import { RedDot } from '../../../Frame/RedDot/RedDot';

export const appRedDotId = {
    main: 'main',
    team: 'main/team',
    stage: 'main/stage',
    setting: 'main/setting',
    stageOf: (chapterId: string): string => `main/stage/${chapterId}`,
} as const;

export function registerAppRedDots(): void {
    RedDot.Batch(() => {
        RedDot.Register(appRedDotId.main);
        RedDot.Register(appRedDotId.team, appRedDotId.main);
        RedDot.Register(appRedDotId.stage, appRedDotId.main);
        RedDot.Register(appRedDotId.setting, appRedDotId.main);
    });
}

export function seedDemoRedDots(): void {
    RedDot.Batch(() => {
        RedDot.Set(appRedDotId.team, 2);
        RedDot.Register(appRedDotId.stageOf('1001'), appRedDotId.stage, 100);
        RedDot.Register(appRedDotId.stageOf('1002'), appRedDotId.stage, 20);
    });
}