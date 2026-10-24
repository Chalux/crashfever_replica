"""Build the app prefabs from verified original art and existing Cocos component defaults.

Run after inspect-ui-evidence.py and editor asset import. Numeric layout is an
adaptation to 720x1280, not a recovered original layout. Existing files are
backed up in reverse/project-ui-before by the implementation workflow.
"""
from pathlib import Path
import copy
import json
import uuid
import sys

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = json.loads(Path(__file__).with_name('cocos-ui-component-templates.json').read_text(encoding='utf-8'))
OUT = ROOT / 'assets/resources/ui/app'
SCRIPTS = ROOT / 'assets/Scripts/Model/App/UI'
SELECTED = set(sys.argv[1:])


def ref(index):
    return {'__id__': index}


def color(r, g, b, a=255):
    return dict(__type__='cc.Color', r=r, g=g, b=b, a=a)


def script_type(name):
    identifier = json.loads((SCRIPTS / (name + '.ts.meta')).read_text())['uuid'].replace('-', '')
    alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    return identifier[:5] + ''.join(alphabet[int(identifier[i:i+3], 16) >> 6] +
                                     alphabet[int(identifier[i:i+3], 16) & 63]
                                     for i in range(5, 32, 3))


def frame(path):
    meta = json.loads((ROOT / 'assets/resources/ui' / (path + '.png.meta')).read_text())
    return {'__uuid__': meta['subMetas']['f9941']['uuid'], '__expectedType__': 'cc.SpriteFrame'}


class Prefab:
    def __init__(self, name):
        self.name = name
        self.items = [dict(__type__='cc.Prefab', _name=name, _objFlags=0,
                           __editorExtras__={}, _native='', data=ref(1),
                           optimizationPolicy=0, persistent=False)]
        self.root = self.node(name, None, 720, 1280)

    def add(self, value):
        self.items.append(value)
        return len(self.items) - 1

    def node(self, name, parent, width, height, x=0, y=0):
        node = dict(__type__='cc.Node', _name=name, _objFlags=0, __editorExtras__={},
                    _parent=ref(parent) if parent is not None else None,
                    _children=[], _active=True, _components=[],
                    _lpos=dict(__type__='cc.Vec3', x=x, y=y, z=0),
                    _lrot=dict(__type__='cc.Quat', x=0, y=0, z=0, w=1),
                    _lscale=dict(__type__='cc.Vec3', x=1, y=1, z=1),
                    _mobility=0, _layer=1073741824,
                    _euler=dict(__type__='cc.Vec3', x=0, y=0, z=0), _id='')
        index = self.add(node)
        node['_prefab'] = ref(self.add(dict(__type__='cc.PrefabInfo', root=ref(1), asset=ref(0),
                                           fileId=uuid.uuid4().hex[:22], instance=None, targetOverrides=None)))
        if parent is not None:
            self.items[parent]['_children'].append(ref(index))
        self.comp(index, 'cc.UITransform', _contentSize=dict(__type__='cc.Size', width=width, height=height),
                  _anchorPoint=dict(__type__='cc.Vec2', x=0.5, y=0.5))
        return index

    def comp(self, node, kind, **properties):
        value = copy.deepcopy(TEMPLATES.get(kind, {}))
        value.update(dict(__type__=kind, _name='', _objFlags=0, __editorExtras__={},
                          node=ref(node), _enabled=True, _id=''))
        value.update(properties)
        value['__prefab'] = ref(self.add(dict(__type__='cc.CompPrefabInfo', fileId=uuid.uuid4().hex[:22])))
        index = self.add(value)
        self.items[node]['_components'].append(ref(index))
        return index

    def custom(self, node, name, **properties):
        return self.comp(node, script_type(name), **properties)

    def transform(self, node):
        return self.items[self.items[node]['_components'][0]['__id__']]

    def sprite(self, name, parent, image, width, height, x=0, y=0, sliced=False, tint=None):
        node = self.node(name, parent, width, height, x, y)
        self.comp(node, 'cc.Sprite', _spriteFrame=frame(image), _type=1 if sliced else 0,
                  _sizeMode=0, _color=tint or color(255, 255, 255))
        return node

    def label(self, name, parent, text, width, height, x=0, y=0, size=28, tint=None, outline=False):
        node = self.node(name, parent, width, height, x, y)
        component = self.comp(node, 'cc.Label', _string=text, _fontSize=size, _actualFontSize=size,
                              _lineHeight=size+10, _fontFamily='Microsoft YaHei', _isBold=True,
                              _color=tint or color(42, 51, 67), _overflow=1, _enableWrapText=True,
                              _enableOutline=outline, _outlineColor=color(31, 46, 70), _outlineWidth=3)
        return node, component

    def button(self, name, parent, text, x=0, y=0, image='common/dialog/art/btn_DialogBlue', width=224, height=76):
        node = self.sprite(name, parent, image, width, height, x, y, sliced=True)
        component = self.comp(node, 'cc.Button', _target=ref(node), _transition=3, _zoomScale=0.96,
                              _interactable=True, clickEvents=[], _normalSprite=None,
                              _hoverSprite=None, _pressedSprite=None, _disabledSprite=None)
        self.custom(node, 'ButtonSound', _soundPath='audio/sfx/candidates/sse_009')
        _, label = self.label('Label', node, text, width-16, height-12, size=28,
                              tint=color(255,255,255), outline=True)
        return node, component, label

    def fullscreen(self, node):
        self.comp(node, 'cc.Widget', _alignFlags=45, _left=0, _right=0, _top=0, _bottom=0,
                  _target=None, _alignMode=2)

    def backdrop(self, home=False):
        # Preserve art aspect ratio, crop at the viewport instead of stretching.
        image = 'original/home/background' if home else 'original/title/background'
        width, height = (2244,1280) if home else (832,1280)
        self.sprite('OriginalBackground', self.root, image, width, height)

    def modal(self):
        shade = self.sprite('ModalShade', self.root, 'original/controls/solidBlue', 720, 1280,
                            tint=color(0,0,0,160))
        self.fullscreen(shade)
        self.comp(self.root, 'cc.BlockInputEvents')

    def dialog_frame(self, content_height=240):
        height = content_height + 260
        node = self.node('BaseDlgFrame', self.root, 608, height)
        background = self.sprite('Background', node, 'common/dialog/art/bgi_DialogFrame', 608, height, sliced=True)
        self.fullscreen(background)
        title_band = self.sprite('TitleBand', node, 'common/dialog/art/bgi_DialogTitle_L', 526, 68,
                                 y=height/2-64, sliced=True)
        self.comp(title_band, 'cc.Widget', _alignFlags=17, _top=30, _horizontalCenter=0, _alignMode=2)
        stack = self.node('Stack', node, 608, height)
        layout = self.comp(stack, 'cc.Layout', _enabled=False)
        title, title_label = self.label('Title', stack, '请确认', 450, 58, x=-16,
                                        y=height/2-64, size=30, tint=color(255,255,255))
        content = self.node('ContentRoot', stack, 512, content_height, y=6)
        footer = self.node('Footer', stack, 512, 90, y=-height/2+86)
        confirm, confirm_button, confirm_label = self.button('ConfirmBtn', footer, '确认', x=128)
        cancel, cancel_button, cancel_label = self.button('CancelBtn', footer, '取消', x=-128, image='common/dialog/art/btn_DialogRed')
        close, close_button, _ = self.button('CloseBtn', node, '', x=276, y=height/2-26,
                                           image='common/dialog/art/btn_DialogClose', width=56, height=56)
        self.items[close]['_active'] = False
        component = self.custom(node, 'BaseDlgFrame', _stack=ref(layout), _title=ref(title_label),
                                _closeBtn=ref(close_button), _confirmBtn=ref(confirm_button), _cancelBtn=ref(cancel_button),
                                _confirmLabel=ref(confirm_label), _cancelLabel=ref(cancel_label),
                                _contentRoot=ref(content), _footer=ref(footer), _minHeight=320)
        return node, content, component

    def save(self):
        if SELECTED and self.name not in SELECTED:
            return
        (OUT / (self.name + '.prefab')).write_text(json.dumps(self.items, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def build():
    p = Prefab('TitleWin'); p.backdrop()
    p.sprite('TitleCharacters', p.root, 'original/title/characters', 710, 1016, y=-25)
    p.label('ChineseTitle', p.root, '粉 碎 狂 热', 640, 100, y=475, size=66, tint=color(255,255,255), outline=True)
    p.label('Subtitle', p.root, 'CRASH FEVER', 540, 44, y=411, size=28, tint=color(255,255,255), outline=True)
    p.label('EnterHint', p.root, '点击屏幕进入', 480, 64, y=-440, size=36, tint=color(255,255,255), outline=True)
    p.label('OfflineHint', p.root, '离线单人 · 学习复刻', 480, 40, y=-568, size=20, tint=color(255,255,255), outline=True)
    area=p.node('EnterArea',p.root,720,1280)
    button=p.comp(area,'cc.Button',_target=ref(area),_transition=0,clickEvents=[])
    p.custom(p.root,'TitleWin',_enterArea=ref(button));p.save()

    p=Prefab('BootLoadingWin');p.backdrop()
    p.label('Title',p.root,'粉碎狂热',560,90,y=180,size=60,tint=color(255,255,255),outline=True)
    _, loading=p.label('LoadingText',p.root,'正在加载本地资源…',560,70,y=-260,size=28,tint=color(255,255,255),outline=True)
    p.custom(p.root,'BootLoadingWin',_loadingText=ref(loading));p.save()

    p=Prefab('MainWin');p.backdrop(home=True)
    p.sprite('OriginalHeader',p.root,'original/home/bgi_HeaderCover_v10',704,101,y=584)
    p.label('HeaderTitle',p.root,'粉碎狂热',480,60,y=581,size=35,tint=color(255,255,255),outline=True)
    p.sprite('OriginalFooter',p.root,'original/home/bgi_FooterBtnBase_v10',716,104,y=-584)
    p.label('HomeLabel',p.root,'主界面',460,90,y=370,size=42,tint=color(255,255,255),outline=True)
    p.label('ScopeHint',p.root,'离线单人模式',400,44,y=310,size=24,tint=color(255,255,255),outline=True)
    _,team,_=p.button('TeamButton',p.root,'角色编队',x=-160,y=-390,width=280,height=86)
    _,stage,_=p.button('StageButton',p.root,'关卡选择',x=160,y=-390,width=280,height=86,image='common/dialog/art/btn_DialogGreen')
    setting=p.node('SettingButton',p.root,110,110,x=272,y=456)
    icon_view=p.node('IconViewport',setting,88,48,y=14)
    p.comp(icon_view,'cc.Mask',_type=0,_inverted=False,_segments=64,_alphaThreshold=0.1,_spriteFrame=None)
    p.sprite('OriginalIcon',icon_view,'original/home/ico_home_setting',88,79,y=-15.5)
    setting_button=p.comp(setting,'cc.Button',_target=ref(setting),_transition=3,_zoomScale=0.96,clickEvents=[])
    p.custom(setting,'ButtonSound',_soundPath='audio/sfx/candidates/sse_009')
    p.label('SettingsText',setting,'设置',90,34,y=-52,size=22,tint=color(255,255,255),outline=True)
    _,test,_=p.button('ConfirmTestButton',p.root,'确认弹窗测试',y=-565,width=300,height=70)
    p.custom(p.root,'MainWin',_teamEditBtn=ref(team),_stagePickBtn=ref(stage),_settingBtn=ref(setting_button),_confirmTestBtn=ref(test));p.save()

    p=Prefab('BaseDlgFrame');_,_,_=p.dialog_frame();p.save()

    p=Prefab('SettingDlg');p.modal();_,content,frame_component=p.dialog_frame(512)
    bindings={}
    for prefix,title,y in [('master','总音量',194),('bgm','背景音乐',62),('sfx','音效',-70)]:
        p.label(prefix+'Label',content,title,300,46,x=-100,y=y,size=28)
        toggle_node=p.sprite(prefix+'Toggle',content,'original/controls/checkbox',40,40,x=225,y=y)
        check=p.sprite('Checkmark',toggle_node,'original/controls/check',42,34)
        check_sprite=next(c['__id__'] for c in p.items[check]['_components'] if p.items[c['__id__']]['__type__']=='cc.Sprite')
        toggle=p.comp(toggle_node,'cc.Toggle',_target=ref(toggle_node),_transition=0,_isChecked=True,
                      _checkMark=ref(check_sprite),clickEvents=[],checkEvents=[],_normalSprite=None,
                      _hoverSprite=None,_pressedSprite=None,_disabledSprite=None)
        p.custom(toggle_node,'ButtonSound',_soundPath='audio/sfx/candidates/sse_009')
        slider_node=p.sprite(prefix+'Slider',content,'original/controls/sliderTrack',456,26,y=y-48)
        handle=p.sprite('Handle',slider_node,'original/controls/sliderThumb',44,44,x=228)
        handle_button=p.comp(handle,'cc.Button',_target=ref(handle),_transition=0,clickEvents=[])
        slider=p.comp(slider_node,'cc.Slider',_handle=ref(handle_button),_direction=0,_progress=1,slideEvents=[])
        bindings['_'+prefix+'Slider']=ref(slider);bindings['_'+prefix+'Toggle']=ref(toggle)
    _,import_button,_=p.button('ImportSaveButton',content,'导入存档',x=-128,y=-210,
                              image='common/dialog/art/btn_DialogGreen')
    _,export_button,_=p.button('ExportSaveButton',content,'导出存档',x=128,y=-210)
    bindings['_importSaveBtn']=ref(import_button)
    bindings['_exportSaveBtn']=ref(export_button)
    p.custom(p.root,'SettingDlg',_frame=ref(frame_component),**bindings);p.save()

    p=Prefab('ConfirmDlg');p.modal();_,content,frame_component=p.dialog_frame(240)
    view=p.node('MessageScroll',content,512,240)
    p.comp(view,'cc.Mask',_type=0,_inverted=False,_segments=64,_alphaThreshold=0.1,_spriteFrame=None)
    scroll_content=p.node('ScrollContent',view,512,240,y=120)
    p.transform(scroll_content)['_anchorPoint']['y']=1
    text,label=p.label('Message',scroll_content,'是否执行本次操作？',488,160,y=-16,size=28)
    p.transform(text)['_anchorPoint']['y']=1
    p.items[label].update(_overflow=3,_horizontalAlign=0,_verticalAlign=0,_isBold=False)
    scroll=p.comp(view,'cc.ScrollView',_content=ref(scroll_content),horizontal=False,vertical=True,
                  inertia=True,brake=0.75,elastic=True,bounceDuration=0.23,
                  _horizontalScrollBar=None,_verticalScrollBar=None,scrollEvents=[],cancelInnerEvents=True)
    p.custom(p.root,'ConfirmDlg',_frame=ref(frame_component),_message=ref(label),_scroll=ref(scroll));p.save()
    print('Generated app prefabs:', ', '.join(sorted(SELECTED)) if SELECTED else 'all 6')


if __name__=='__main__':
    build()
