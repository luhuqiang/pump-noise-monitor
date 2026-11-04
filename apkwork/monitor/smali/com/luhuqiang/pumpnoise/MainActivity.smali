.class public Lcom/luhuqiang/pumpnoise/MainActivity;
.super Landroid/app/Activity;
.source "MainActivity.java"


# annotations
.annotation system Ldalvik/annotation/MemberClasses;
    value = {
        Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;
    }
.end annotation


# static fields
.field private static final HOST:Ljava/lang/String; = "appassets.local"

.field private static final MIC_REQUEST:I = 0x1

.field private static final START_URL:Ljava/lang/String; = "https://appassets.local/"


# instance fields
.field private pendingAudio:Landroid/webkit/PermissionRequest;

.field private web:Landroid/webkit/WebView;


# direct methods
.method static bridge synthetic -$$Nest$fputpendingAudio(Lcom/luhuqiang/pumpnoise/MainActivity;Landroid/webkit/PermissionRequest;)V
    .locals 0

    iput-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->pendingAudio:Landroid/webkit/PermissionRequest;

    return-void
.end method

.method static bridge synthetic -$$Nest$smmimeFor(Ljava/lang/String;)Ljava/lang/String;
    .locals 0

    invoke-static {p0}, Lcom/luhuqiang/pumpnoise/MainActivity;->mimeFor(Ljava/lang/String;)Ljava/lang/String;

    move-result-object p0

    return-object p0
.end method

.method public constructor <init>()V
    .locals 0

    .line 30
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method

.method private static mimeFor(Ljava/lang/String;)Ljava/lang/String;
    .locals 2

    .line 134
    const-string v0, ".js"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-nez v0, :cond_e

    const-string v0, ".mjs"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_0

    goto/16 :goto_1

    .line 135
    :cond_0
    const-string v0, ".css"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_1

    const-string p0, "text/css"

    return-object p0

    .line 136
    :cond_1
    const-string v0, ".html"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_2

    const-string p0, "text/html"

    return-object p0

    .line 137
    :cond_2
    const-string v0, ".json"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    const-string v1, "application/json"

    if-eqz v0, :cond_3

    return-object v1

    .line 138
    :cond_3
    const-string v0, ".svg"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_4

    const-string p0, "image/svg+xml"

    return-object p0

    .line 139
    :cond_4
    const-string v0, ".png"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_5

    const-string p0, "image/png"

    return-object p0

    .line 140
    :cond_5
    const-string v0, ".jpg"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-nez v0, :cond_d

    const-string v0, ".jpeg"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_6

    goto :goto_0

    .line 141
    :cond_6
    const-string v0, ".webp"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_7

    const-string p0, "image/webp"

    return-object p0

    .line 142
    :cond_7
    const-string v0, ".woff2"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_8

    const-string p0, "font/woff2"

    return-object p0

    .line 143
    :cond_8
    const-string v0, ".woff"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_9

    const-string p0, "font/woff"

    return-object p0

    .line 144
    :cond_9
    const-string v0, ".ico"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_a

    const-string p0, "image/x-icon"

    return-object p0

    .line 145
    :cond_a
    const-string v0, ".txt"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result v0

    if-eqz v0, :cond_b

    const-string p0, "text/plain"

    return-object p0

    .line 146
    :cond_b
    const-string v0, ".map"

    invoke-virtual {p0, v0}, Ljava/lang/String;->endsWith(Ljava/lang/String;)Z

    move-result p0

    if-eqz p0, :cond_c

    return-object v1

    .line 147
    :cond_c
    const-string p0, "application/octet-stream"

    return-object p0

    .line 140
    :cond_d
    :goto_0
    const-string p0, "image/jpeg"

    return-object p0

    .line 134
    :cond_e
    :goto_1
    const-string p0, "application/javascript"

    return-object p0
.end method


# virtual methods
.method protected onCreate(Landroid/os/Bundle;)V
    .locals 3

    .line 42
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    .line 44
    new-instance p1, Landroid/widget/FrameLayout;

    invoke-direct {p1, p0}, Landroid/widget/FrameLayout;-><init>(Landroid/content/Context;)V

    .line 45
    new-instance v0, Landroid/view/ViewGroup$LayoutParams;

    const/4 v1, -0x1

    invoke-direct {v0, v1, v1}, Landroid/view/ViewGroup$LayoutParams;-><init>(II)V

    invoke-virtual {p1, v0}, Landroid/widget/FrameLayout;->setLayoutParams(Landroid/view/ViewGroup$LayoutParams;)V

    .line 46
    new-instance v0, Landroid/webkit/WebView;

    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V

    iput-object v0, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    .line 47
    iget-object v0, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    new-instance v2, Landroid/widget/FrameLayout$LayoutParams;

    invoke-direct {v2, v1, v1}, Landroid/widget/FrameLayout$LayoutParams;-><init>(II)V

    invoke-virtual {v0, v2}, Landroid/webkit/WebView;->setLayoutParams(Landroid/view/ViewGroup$LayoutParams;)V

    .line 48
    iget-object v0, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    invoke-virtual {p1, v0}, Landroid/widget/FrameLayout;->addView(Landroid/view/View;)V

    .line 49
    invoke-virtual {p0, p1}, Lcom/luhuqiang/pumpnoise/MainActivity;->setContentView(Landroid/view/View;)V

    .line 51
    iget-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    invoke-virtual {p1}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;

    move-result-object p1

    .line 52
    const/4 v0, 0x1

    invoke-virtual {p1, v0}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V

    .line 53
    invoke-virtual {p1, v0}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V

    .line 54
    invoke-virtual {p1, v0}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V

    .line 55
    const/4 v1, 0x0

    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V

    .line 56
    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setAllowContentAccess(Z)V

    .line 57
    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V

    .line 58
    invoke-virtual {p1, v0}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V

    .line 59
    invoke-virtual {p1, v0}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V

    .line 60
    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setSupportZoom(Z)V

    .line 61
    invoke-virtual {p1, v1}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V

    .line 63
    iget-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    new-instance v0, Lcom/luhuqiang/pumpnoise/MainActivity$1;

    invoke-direct {v0, p0}, Lcom/luhuqiang/pumpnoise/MainActivity$1;-><init>(Lcom/luhuqiang/pumpnoise/MainActivity;)V

    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    .line 87
    iget-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    new-instance v0, Lcom/luhuqiang/pumpnoise/MainActivity$2;

    invoke-direct {v0, p0}, Lcom/luhuqiang/pumpnoise/MainActivity$2;-><init>(Lcom/luhuqiang/pumpnoise/MainActivity;)V

    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    .line 107
    iget-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    new-instance v0, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;

    const/4 v1, 0x0

    invoke-direct {v0, p0, v1}, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;-><init>(Lcom/luhuqiang/pumpnoise/MainActivity;Lcom/luhuqiang/pumpnoise/MainActivity$Bridge-IA;)V

    const-string v1, "NativeBridge"

    invoke-virtual {p1, v0, v1}, Landroid/webkit/WebView;->addJavascriptInterface(Ljava/lang/Object;Ljava/lang/String;)V

    .line 108
    iget-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    const-string v0, "https://appassets.local/"

    invoke-virtual {p1, v0}, Landroid/webkit/WebView;->loadUrl(Ljava/lang/String;)V

    .line 109
    return-void
.end method

.method protected onDestroy()V
    .locals 2

    .line 126
    iget-object v0, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    if-eqz v0, :cond_0

    .line 127
    iget-object v0, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    const-string v1, "NativeBridge"

    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->removeJavascriptInterface(Ljava/lang/String;)V

    .line 128
    iget-object v0, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->web:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V

    .line 130
    :cond_0
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V

    .line 131
    return-void
.end method

.method public onRequestPermissionsResult(I[Ljava/lang/String;[I)V
    .locals 0

    .line 113
    invoke-super {p0, p1, p2, p3}, Landroid/app/Activity;->onRequestPermissionsResult(I[Ljava/lang/String;[I)V

    .line 114
    const/4 p2, 0x1

    if-ne p1, p2, :cond_2

    iget-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->pendingAudio:Landroid/webkit/PermissionRequest;

    if-nez p1, :cond_0

    goto :goto_1

    .line 115
    :cond_0
    iget-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->pendingAudio:Landroid/webkit/PermissionRequest;

    .line 116
    const/4 p2, 0x0

    iput-object p2, p0, Lcom/luhuqiang/pumpnoise/MainActivity;->pendingAudio:Landroid/webkit/PermissionRequest;

    .line 117
    array-length p2, p3

    if-lez p2, :cond_1

    const/4 p2, 0x0

    aget p2, p3, p2

    if-nez p2, :cond_1

    .line 118
    const-string p2, "android.webkit.resource.AUDIO_CAPTURE"

    filled-new-array {p2}, [Ljava/lang/String;

    move-result-object p2

    invoke-virtual {p1, p2}, Landroid/webkit/PermissionRequest;->grant([Ljava/lang/String;)V

    goto :goto_0

    .line 120
    :cond_1
    invoke-virtual {p1}, Landroid/webkit/PermissionRequest;->deny()V

    .line 122
    :goto_0
    return-void

    .line 114
    :cond_2
    :goto_1
    return-void
.end method
