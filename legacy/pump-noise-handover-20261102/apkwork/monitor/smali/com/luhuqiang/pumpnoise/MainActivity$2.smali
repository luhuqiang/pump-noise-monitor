.class Lcom/luhuqiang/pumpnoise/MainActivity$2;
.super Landroid/webkit/WebChromeClient;
.source "MainActivity.java"


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/luhuqiang/pumpnoise/MainActivity;->onCreate(Landroid/os/Bundle;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$0:Lcom/luhuqiang/pumpnoise/MainActivity;


# direct methods
.method constructor <init>(Lcom/luhuqiang/pumpnoise/MainActivity;)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x8010
        }
        names = {
            null
        }
    .end annotation

    .line 87
    iput-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity$2;->this$0:Lcom/luhuqiang/pumpnoise/MainActivity;

    invoke-direct {p0}, Landroid/webkit/WebChromeClient;-><init>()V

    return-void
.end method


# virtual methods
.method public onPermissionRequest(Landroid/webkit/PermissionRequest;)V
    .locals 6

    .line 90
    nop

    .line 91
    invoke-virtual {p1}, Landroid/webkit/PermissionRequest;->getResources()[Ljava/lang/String;

    move-result-object v0

    array-length v1, v0

    const/4 v2, 0x0

    const/4 v3, 0x0

    :goto_0
    if-ge v3, v1, :cond_1

    aget-object v4, v0, v3

    .line 92
    const-string v5, "android.webkit.resource.AUDIO_CAPTURE"

    invoke-virtual {v5, v4}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v5

    if-eqz v5, :cond_0

    move-object v2, v4

    .line 91
    :cond_0
    add-int/lit8 v3, v3, 0x1

    goto :goto_0

    .line 94
    :cond_1
    if-nez v2, :cond_2

    .line 95
    invoke-virtual {p1}, Landroid/webkit/PermissionRequest;->deny()V

    .line 96
    return-void

    .line 98
    :cond_2
    iget-object v0, p0, Lcom/luhuqiang/pumpnoise/MainActivity$2;->this$0:Lcom/luhuqiang/pumpnoise/MainActivity;

    const-string v1, "android.permission.RECORD_AUDIO"

    invoke-virtual {v0, v1}, Lcom/luhuqiang/pumpnoise/MainActivity;->checkSelfPermission(Ljava/lang/String;)I

    move-result v0

    if-nez v0, :cond_3

    .line 99
    filled-new-array {v2}, [Ljava/lang/String;

    move-result-object v0

    invoke-virtual {p1, v0}, Landroid/webkit/PermissionRequest;->grant([Ljava/lang/String;)V

    .line 100
    return-void

    .line 102
    :cond_3
    iget-object v0, p0, Lcom/luhuqiang/pumpnoise/MainActivity$2;->this$0:Lcom/luhuqiang/pumpnoise/MainActivity;

    invoke-static {v0, p1}, Lcom/luhuqiang/pumpnoise/MainActivity;->-$$Nest$fputpendingAudio(Lcom/luhuqiang/pumpnoise/MainActivity;Landroid/webkit/PermissionRequest;)V

    .line 103
    iget-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity$2;->this$0:Lcom/luhuqiang/pumpnoise/MainActivity;

    filled-new-array {v1}, [Ljava/lang/String;

    move-result-object v0

    const/4 v1, 0x1

    invoke-virtual {p1, v0, v1}, Lcom/luhuqiang/pumpnoise/MainActivity;->requestPermissions([Ljava/lang/String;I)V

    .line 104
    return-void
.end method
