import { Component, Node, Label, _decorator } from "cc";
import { RedDot } from "./RedDot";
import { BindingScope } from "../UI";
import { formatRedDotCount } from "./RedDotFormat";
import { Log, LogOptions } from "../Log";

const { ccclass, property } = _decorator;

@ccclass('RedDotBadge')
export class RedDotBadge extends Component {
    @property({ type: String, visible: true })
    private _redDotId: string = '';

    @property({ type: Node, visible: true })
    private _visual: Node | null = null;

    @property({ type: Label, visible: true })
    private _countLabel: Label | null = null;

    @property({ type: Boolean, visible: true })
    private _dotOnly: boolean = false;

    @property({ type: Number, visible: true })
    private _maxCount: number = 99;

    private _binder: BindingScope = new BindingScope();

    public get RedDotId(): string {
        return this._redDotId;
    }

    public set RedDotId(value: string) {
        this._redDotId = value;
        this._update();
    }

    protected onLoad(): void {
        this._binder.add(RedDot.OnChanged(change => {
            if (change.ids.has(this._redDotId)) this._update();
        }));
    }

    private _update(): void {
        if (!this._visual || this._visual === this.node) {
            Log.error("RedDotBadge: Visual必须绑定独立子节点", { tag: "RedDot" } as LogOptions);
            return;
        }
        this._visual.active = RedDot.Has(this._redDotId);
        if (this._countLabel) {
            this._countLabel.node.active = !this._dotOnly;
            if (!this._dotOnly) {
                this._countLabel.string = formatRedDotCount(RedDot.Get(this._redDotId), this._maxCount);
            }
        }
    }

    protected onEnable(): void {
        this._update();
    }

    protected onDestroy(): void {
        this._binder.unbindAll();
    }
}
