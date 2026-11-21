"""#2293's plain-text HUD panel. The game and its room keep running while the edit box has focus."""
import unreal as u
import player_parts as pp
from build_network import component, join, empty
from build_network_peers import string_eq

UI = "/Script/UMG."
S = "KismetStringLibrary:"
K = "KismetSystemLibrary:"
WIDGET = "/Game/Lunden/Network/Shared/WBP_LundenSharedChat"
HUD = "/Game/Lunden/UI/WBP_LundenHud"
CONTROLS = "/Game/Lunden/UI/BPC_LundenUI"
ME = pp.class_path(WIDGET) + ":"
METHODS = ("OpenChat", "CloseChat", "Submit", "DraftChanged", "UpdateChat")


def tree(bp):
    def add(cls, name, parent):
        obj = u.EditorUtilityLibrary.add_source_widget(bp, cls, name, parent)
        if not obj:
            raise RuntimeError("Could not create chat widget " + name)
        return obj

    def label(parent, key, text):
        holder = add(u.InvalidationBox, key, parent)
        holder.set_editor_property("can_cache", False)
        t = add(u.TextBlock, key + "Text", key)
        t.set_text(u.Text(text))
        t.set_editor_property("auto_wrap_text", True)
        font = t.get_editor_property("font")
        font.set_editor_property("size", 14)
        t.set_editor_property("font", font)
        return holder

    size = add(u.SizeBox, "ChatSize", "")
    size.set_width_override(320)
    frame = add(u.Border, "Frame", "ChatSize")
    frame.set_editor_property("brush_color", u.LinearColor(.015, .027, .04, .82))
    frame.set_editor_property("padding", u.Margin(10, 6, 10, 6))
    add(u.VerticalBox, "Body", "Frame")
    label("Body", "Summary", "")
    label("Body", "Writing", "")
    panel = add(u.VerticalBox, "EditorPanel", "Body")
    panel.set_visibility(u.SlateVisibility.COLLAPSED)
    scroll = add(u.SizeBox, "HistorySize", "EditorPanel")
    scroll.set_height_override(108)
    add(u.ScrollBox, "HistoryScroll", "HistorySize")
    label("HistoryScroll", "History", "")
    box = add(u.EditableTextBox, "Draft", "EditorPanel")
    box.set_editor_property("minimum_desired_width", 280.0)
    box.set_editor_property("hint_text", u.Text("Meddelande"))
    add(u.HorizontalBox, "Buttons", "EditorPanel")
    for key, title in (("SendButton", "Skicka"), ("CloseButton", "Stäng")):
        add(u.Button, key, "Buttons")
        label(key, key + "Label", title)


def controller(g):
    return g.pure(UI + "Widget:GetOwningPlayer")


def write_label(g, name, text):
    content = g.pure(UI + "ContentWidget:GetContent", g.get(name))
    t = g.cast(content, ["CastToTextBlock"], u.TextBlock.static_class())
    g.run(UI + "TextBlock:SetText", t, InText=g.pure("KismetTextLibrary:Conv_StringToText", InString=text))


def edit_panel(g):
    # VerticalBox, ScrollBox and Border opt out of Blueprint variables in stock UMG.
    return g.pure(UI + "Widget:GetParent", g.get("Draft"))


def chat_frame(g):
    # Summary is an exposed InvalidationBox under Body, directly inside Frame.
    body = g.pure(UI + "Widget:GetParent", g.get("Summary"))
    return g.pure(UI + "Widget:GetParent", body)


def scroll_history(g):
    parent = g.pure(UI + "Widget:GetParent", g.get("History"))
    scroll = g.cast(parent, ["CastToScrollBox"], u.ScrollBox.static_class())
    g.run(UI + "ScrollBox:ScrollToEnd", scroll)


def room(g, path):
    pawn = g.pure("Controller:K2_GetPawn", target=controller(g))
    return component(g, pawn, path)


def functions(bp, path):
    path_cls = pp.class_path(path)
    def get(g, key, obj):
        return g.get(key, path_cls, obj)

    g, _ = pp.function(bp, "OpenChat")
    target = room(g, path)
    g.branch(get(g, "Joined", target))
    g.branch(g.op("Not_PreBool", A=g.pure("GameplayStatics:IsGamePaused")))
    g.set("Editing", True)
    g.run(UI + "Widget:SetVisibility", edit_panel(g), InVisibility="Visible")
    g.run(UI + "WidgetBlueprintLibrary:SetInputMode_UIOnlyEx", PlayerController=controller(g), InWidgetToFocus=g.get("Draft"),
          InMouseLockMode="DoNotLock", bFlushInput=True)
    g.set("bShowMouseCursor", True, "/Script/Engine.PlayerController", controller(g))
    g.run(UI + "Widget:SetKeyboardFocus", g.get("Draft"))
    scroll_history(g)

    g, _ = pp.function(bp, "CloseChat")
    g.branch(g.get("Editing"))
    g.set("Editing", False)
    g.set("IsTyping", False)
    g.run(UI + "EditableTextBox:SetText", g.get("Draft"), InText=g.pure("KismetTextLibrary:Conv_StringToText", InString=""))
    g.run(UI + "Widget:SetVisibility", edit_panel(g), InVisibility="Collapsed")
    g.run(UI + "WidgetBlueprintLibrary:SetInputMode_GameOnly", PlayerController=controller(g), bFlushInput=True)
    g.set("bShowMouseCursor", False, "/Script/Engine.PlayerController", controller(g))
    g.run(path_cls + ":SendTyping", room(g, path), Typing=False)

    g, _ = pp.function(bp, "Submit")
    g.branch(g.get("Editing"))
    text = g.pure("KismetTextLibrary:Conv_TextToString", InText=g.pure(UI + "EditableTextBox:GetText", g.get("Draft")))
    sent = g.pure(path_cls + ":SendChat", room(g, path), result="Sent", Line=text)
    g.branch(sent)
    g.run(ME + "CloseChat")

    g, _ = pp.function(bp, "DraftChanged")
    g.branch(g.get("Editing"))
    now = g.pure("GameplayStatics:GetRealTimeSeconds")
    g.set("LastKey", now)
    again = g.op("GreaterEqual_DoubleDouble", A=g.op("Subtract_DoubleDouble", A=now, B=g.get("LastTyping")), B=6)
    g.branch(g.op("BooleanOR", A=g.op("Not_PreBool", A=g.get("IsTyping")), B=again))
    g.set("IsTyping", True)
    g.set("LastTyping", now)
    g.run(path_cls + ":SendTyping", room(g, path), Typing=True)

    g, _ = pp.function(bp, "UpdateChat")
    target = room(g, path)
    offline = g.branch(get(g, "Joined", target))
    gone = g.fork(offline, 900)
    gone.run(ME + "CloseChat")
    gone.run(UI + "Widget:SetVisibility", chat_frame(gone), InVisibility="Collapsed")
    g.run(UI + "Widget:SetVisibility", chat_frame(g), InVisibility="SelfHitTestInvisible")
    lines = get(g, "ChatLines", target)
    all_text = g.pure(S + "JoinStringArray", SourceArray=lines, Separator="\n")
    changed = g.branch(g.pure(S + "NotEqual_StrStr", A=all_text, B=g.get("ShownHistory")))
    g.set("ShownHistory", all_text)
    write_label(g, "History", all_text)
    scroll_history(g)
    seq = g.named("Utilities|FlowControl|Sequence")
    g.step(seq, exec_out="then_0")
    pp.link(changed, pp.inp(seq, "execute"))
    max_lives = g.pure(S + "Conv_IntToString", InInt=get(g, "RoomMaxLives", target))
    lives = g.pure(S + "Conv_IntToString", InInt=get(g, "RoomLives", target))
    summary = join(g, ["Liv ", lives, "/", max_lives, "   ·   Enter för chatt"])
    # Show the last public line in the collapsed HUD, too; avoid reading element -1 for a new connection.
    length = g.pure("KismetArrayLibrary:Array_Length", TargetArray=lines)
    no_lines = g.branch(g.op("Greater_IntInt", A=length, B=0))
    last = g.item(lines, g.op("Subtract_IntInt", A=length, B=1))
    write_label(g, "Summary", join(g, [summary, "\n", last]))
    none = g.fork(no_lines, 700)
    write_label(none, "Summary", summary)
    seq = g.named("Utilities|FlowControl|Sequence")
    g.step(seq, exec_out="then_0")
    pp.link(none.exec, pp.inp(seq, "execute"))
    names = get(g, "TypingNames", target)
    time_since_notice = g.op("Subtract_DoubleDouble", A=g.pure("GameplayStatics:GetRealTimeSeconds"), B=get(g, "NoticeAt", target))
    notice = g.op("SelectString", A=get(g, "ChatNotice", target), B="", bPickA=g.op("Less_DoubleDouble", A=time_since_notice, B=3))
    typing = g.op("SelectString", A=notice, B=join(g, [names, " skriver…"]), bPickA=empty(g, names))
    write_label(g, "Writing", typing)
    g.branch(g.get("IsTyping"))
    elapsed = g.op("Subtract_DoubleDouble", A=g.pure("GameplayStatics:GetRealTimeSeconds"), B=g.get("LastKey"))
    g.branch(g.op("GreaterEqual_DoubleDouble", A=elapsed, B=4.5))
    g.set("IsTyping", False)
    g.run(path_cls + ":SendTyping", target, Typing=False)


def events(bp):
    g = pp.events(bp)
    pp.event(g, bp, "AddEvent|EventConstruct", "Construct", 0)
    for name, delegate, call in (("SendButton", "OnClicked", "Submit"), ("CloseButton", "OnClicked", "CloseChat"),
                                 ("Draft", "OnTextChanged", "DraftChanged")):
        widget = g.get(name)
        choice = next(str(c) for c in g.g.list_available_nodes([widget]) if str(c).endswith("|Assign" + delegate))
        before = {n.get_name() for n in g.g.list_all_nodes()}
        assign = g.g.create_node_from_name(choice, u.Vector2D(g.x, 0), [widget])
        g.step(assign)
        widget.try_create_connection(pp.inp(assign, "self"))
        handler, = [n for n in g.g.list_all_nodes() if n.get_name() not in before and n.get_class().get_name() == "K2Node_CustomEvent"]
        body = g.fork(pp.out(handler, "then"), 400)
        body.run(ME + call)
        pp.BP.compile_blueprint(bp)
    g.run(K + "K2_SetTimer", FunctionName="UpdateChat", Time=.20, bLooping=True)
    g.run(ME + "UpdateChat")
    pp.event(g, bp, "AddEvent|EventTick", "Tick", 700)
    g.branch(g.op("Not_PreBool", A=g.get("Editing")))
    g.branch(g.pure("PlayerController:WasInputKeyJustPressed", controller(g), Key="Enter"))
    g.run(ME + "OpenChat")

    editor = pp.GRAPH.get_graph_editor(pp.BP.add_function_override(bp, "OnPreviewKeyDown"))
    entry = next(n for n in editor.list_all_nodes() if n.get_class().get_name() == "K2Node_FunctionEntry")
    editor.remove_nodes([n for n in editor.list_all_nodes() if n != entry])
    g = pp.Graph(editor, pp.out(entry, "then"), bp)
    inactive = g.branch(g.get("Editing"))
    key = g.pure("KismetInputLibrary:GetKey", Input=pp.out(entry, "InKeyEvent"))
    for i, (name, call) in enumerate((("Enter", "Submit"), ("Escape", "CloseChat"))):
        other = g.branch(g.pure("KismetInputLibrary:EqualEqual_KeyKey", A=key, B=name))
        g.run(ME + call)
        g.ret(ReturnValue=g.pure(UI + "WidgetBlueprintLibrary:Handled"))
        g = g.fork(other, 400 + 300 * i)
    for chain in (g, g.fork(inactive, 1100)):
        chain.ret(ReturnValue=chain.pure(UI + "WidgetBlueprintLibrary:Unhandled"))
    pp.compiled(bp)


def build(path):
    fresh = not pp.ASSETS.does_asset_exist(WIDGET)
    folder, name = WIDGET.rsplit("/", 1)
    bp = (u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.WidgetBlueprint, u.WidgetBlueprintFactory())
          if fresh else pp.ASSETS.load_asset(WIDGET))
    if fresh:
        tree(bp)
    else:
        # pp.function compiles the current generated class before creating the next method. Remove
        # the old delegate/tick handlers and the key override before their target functions disappear.
        editor = pp.GRAPH.get_graph_editor_by_name(bp, "EventGraph")
        editor.remove_nodes(list(editor.list_all_nodes()))
        for method in ("OnPreviewKeyDown", *reversed(METHODS)):
            if pp.BP.find_graph(bp, method):
                pp.BP.remove_function_graph(bp, method)
    pp.variables(bp, {"Editing": pp.BOOL, "IsTyping": pp.BOOL, "LastTyping": pp.REAL,
                      "LastKey": pp.REAL, "ShownHistory": pp.STRING})
    functions(bp, path)
    events(bp)
    return bp


def mount(bp, row):
    if row["widget"] != pp.class_path(WIDGET):
        raise ValueError("Invalid #2293 HUD widget class")
    g, _ = pp.function(bp, "MountChat")
    g.branch(g.op("Not_PreBool", A=g.pure(K + "IsValid", Object=g.get("ChatWidget"))))
    pc = g.pure("GameplayStatics:GetPlayerController", PlayerIndex=0)
    gui = component(g, pc, CONTROLS)
    hud = g.get("Hud", pp.class_path(CONTROLS), gui)
    g.branch(g.pure(K + "IsValid", Object=hud))
    # Fps is an existing UMG variable in the HUD's root CanvasPanel even when FPS display is disabled.
    root = g.pure(UI + "Widget:GetParent", g.get("Fps", pp.class_path(HUD), hud))
    canvas = g.cast(root, ["CastToCanvasPanel"], u.CanvasPanel.static_class())
    new = g.named("UserInterface|CreateWidget")
    pp.feed(new, "Class", row["widget"])
    pp.feed(new, "OwningPlayer", pc)
    g.step(new)
    child = pp.out(new, "ReturnValue")
    slot = g.pure(UI + "CanvasPanel:AddChildToCanvas", canvas, Content=child)
    g.run(UI + "CanvasPanelSlot:SetPosition", slot, InPosition=g.op("MakeVector2D", X=16, Y=48))
    g.run(UI + "CanvasPanelSlot:SetAutoSize", slot, InbAutoSize=True)
    g.set("ChatWidget", child)
