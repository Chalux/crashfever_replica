export class RedDotNode {
    public id: string;
    public parent: string | null = null;
    public own: number = 0;
    public children: string[] = [];
    public total: number = 0;

    constructor(id: string, parent: string | null = null, count: number = 0) {
        this.id = id;
        this.parent = parent;
        this.own = this.total = count;
    }

    public Unregister(): void {
        this.parent = null;
        this.own = 0;
        this.children = [];
    }
}
