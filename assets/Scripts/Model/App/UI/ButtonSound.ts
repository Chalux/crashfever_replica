import { _decorator, Button, Component } from 'cc';
import { Sound } from '../../../Frame/Audio/Sound';
const { ccclass, property } = _decorator;

@ccclass('ButtonSound')
export class ButtonSound extends Component {
    @property({ type: String, visible: true })
    private _soundPath: string = 'audio/sfx/candidates/sse_009';

    onLoad(): void {
        this.node.on(Button.EventType.CLICK, this._onClick, this);
    }

    onDestroy(): void {
        this.node.off(Button.EventType.CLICK, this._onClick, this);
    }

    private _onClick(): void {
        if (this._soundPath) {
            Sound.PlaySfx(this._soundPath);
        }
    }
}