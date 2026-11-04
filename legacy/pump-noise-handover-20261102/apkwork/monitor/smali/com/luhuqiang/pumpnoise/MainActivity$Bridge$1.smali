.class Lcom/luhuqiang/pumpnoise/MainActivity$Bridge$1;
.super Ljava/lang/Object;
.source "MainActivity.java"

# interfaces
.implements Ljava/lang/Runnable;


# annotations
.annotation system Ldalvik/annotation/EnclosingMethod;
    value = Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;->shareText(Ljava/lang/String;Ljava/lang/String;)V
.end annotation

.annotation system Ldalvik/annotation/InnerClass;
    accessFlags = 0x0
    name = null
.end annotation


# instance fields
.field final synthetic this$1:Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;

.field final synthetic val$text:Ljava/lang/String;

.field final synthetic val$title:Ljava/lang/String;


# direct methods
.method constructor <init>(Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;Ljava/lang/String;Ljava/lang/String;)V
    .locals 0
    .annotation system Ldalvik/annotation/MethodParameters;
        accessFlags = {
            0x8010,
            0x1010,
            0x1010
        }
        names = {
            null,
            null,
            null
        }
    .end annotation

    .annotation system Ldalvik/annotation/Signature;
        value = {
            "()V"
        }
    .end annotation

    .line 177
    iput-object p2, p0, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge$1;->val$title:Ljava/lang/String;

    iput-object p3, p0, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge$1;->val$text:Ljava/lang/String;

    iput-object p1, p0, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge$1;->this$1:Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    return-void
.end method


# virtual methods
.method public run()V
    .locals 3

    .line 180
    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.intent.action.SEND"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    .line 181
    const-string v1, "text/plain"

    invoke-virtual {v0, v1}, Landroid/content/Intent;->setType(Ljava/lang/String;)Landroid/content/Intent;

    .line 182
    const-string v1, "android.intent.extra.SUBJECT"

    iget-object v2, p0, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge$1;->val$title:Ljava/lang/String;

    invoke-virtual {v0, v1, v2}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;

    .line 183
    const-string v1, "android.intent.extra.TEXT"

    iget-object v2, p0, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge$1;->val$text:Ljava/lang/String;

    invoke-virtual {v0, v1, v2}, Landroid/content/Intent;->putExtra(Ljava/lang/String;Ljava/lang/String;)Landroid/content/Intent;

    .line 184
    iget-object v1, p0, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge$1;->this$1:Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;

    iget-object v1, v1, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge;->this$0:Lcom/luhuqiang/pumpnoise/MainActivity;

    iget-object v2, p0, Lcom/luhuqiang/pumpnoise/MainActivity$Bridge$1;->val$title:Ljava/lang/String;

    invoke-static {v0, v2}, Landroid/content/Intent;->createChooser(Landroid/content/Intent;Ljava/lang/CharSequence;)Landroid/content/Intent;

    move-result-object v0

    invoke-virtual {v1, v0}, Lcom/luhuqiang/pumpnoise/MainActivity;->startActivity(Landroid/content/Intent;)V

    .line 185
    return-void
.end method
