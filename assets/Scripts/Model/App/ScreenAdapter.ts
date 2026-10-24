import { _decorator, Component, ResolutionPolicy, screen, view } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ScreenAdapter')
export class ScreenAdapter extends Component {
    protected onEnable(): void {
        screen.on('window-resize', this._applyAdaptation, this);
        this._applyAdaptation();
    }

    private _applyAdaptation(): void {
        const windowSize = screen.windowSize;
        if (windowSize.width <= 0 || windowSize.height <= 0) {
            return;
        }

        const designWidth = 720;
        const designHeight = 1280;

        const policy =
            windowSize.width / windowSize.height <= designWidth / designHeight
                ? ResolutionPolicy.FIXED_WIDTH
                : ResolutionPolicy.FIXED_HEIGHT;

        view.setDesignResolutionSize(designWidth, designHeight, policy);
    }

    protected onDisable(): void {
        screen.off('window-resize', this._applyAdaptation, this);
    }
}
