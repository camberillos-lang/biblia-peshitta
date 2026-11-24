package org.bibliapeshitta.lectura;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.WindowInsets;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

public final class Lector extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final Uri ORIGEN = Uri.parse("https://" + HOST);
    private static final String INICIO = ORIGEN + "/lector/index.html";
    private static final int PERMISO = 1, GUARDAR = 2, ELEGIR = 3;
    private static final int VERDE = Color.rgb(21, 62, 52);
    private final ExecutorService archivos = Executors.newSingleThreadExecutor();
    private WebView web;
    private WebMessagePort puerto;
    private String ruta = "";
    private int permisoPedido, guardadoPedido;
    private JSONObject exportacion;
    private ValueCallback<Uri[]> elegir;

    @Override public void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().setStatusBarColor(VERDE);
        getWindow().setNavigationBarColor(VERDE);
        FrameLayout marco = new FrameLayout(this);
        marco.setBackgroundColor(VERDE);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            marco.setOnApplyWindowInsetsListener((vista, bordes) -> {
                Insets i = bordes.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                vista.setPadding(i.left, i.top, i.right, i.bottom);
                return bordes;
            });
        }
        setContentView(marco);
        // La interfaz y sus módulos ES requieren una versión moderna de Android System WebView.
        PackageInfo motor = WebView.getCurrentWebViewPackage();
        if (motor == null || !compatible(motor.versionName)) {
            new AlertDialog.Builder(this).setTitle("Actualiza Android System WebView")
                .setMessage("Para abrir Biblia Peshitta, actualiza Android System WebView o Google Chrome en Google Play y vuelve a abrir la app.")
                .setPositiveButton("Abrir Google Play", (d, n) -> {
                    String app = motor != null ? motor.packageName : "com.google.android.webview";
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + app))); }
                    catch (ActivityNotFoundException e) { Toast.makeText(this, "Actualiza el componente desde tu tienda de aplicaciones.", Toast.LENGTH_LONG).show(); }
                    finish();
                }).setNegativeButton("Cerrar", (d,n) -> finish()).setCancelable(false).show();
            return;
        }
        web = new WebView(this);
        marco.addView(web, new FrameLayout.LayoutParams(-1,-1));
        WebSettings ajustes = web.getSettings();
        ajustes.setJavaScriptEnabled(true);
        ajustes.setDomStorageEnabled(true);
        ajustes.setAllowFileAccess(false);
        ajustes.setAllowContentAccess(false);
        ajustes.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ajustes.setTextZoom(100);
        web.setWebViewClient(new Sitio());
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView vista, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (elegir != null) elegir.onReceiveValue(null);
                elegir = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                try { startActivityForResult(intent, ELEGIR); }
                catch (ActivityNotFoundException e) { elegir.onReceiveValue(null); elegir = null; }
                return true;
            }
        });
        if (estado == null) recibirRuta(getIntent());
        else ruta = estado.getString("pendiente", "");
        String ultimo = estado == null ? null : estado.getString("pagina");
        web.loadUrl(ultimo != null && paginaPropia(Uri.parse(ultimo)) ? ultimo : INICIO);
    }

    private static boolean compatible(String version) {
        try { return Integer.parseInt(version.split("\\.")[0]) >= 105; }
        catch (RuntimeException e) { return false; }
    }

    private static boolean propio(Uri u) {
        return "https".equals(u.getScheme()) && HOST.equals(u.getEncodedAuthority());
    }
    private static boolean paginaPropia(Uri u) {
        return propio(u) && "/lector/index.html".equals(u.getEncodedPath());
    }
    private static String mime(String ruta) {
        if (ruta.endsWith(".html")) return "text/html";
        if (ruta.endsWith(".js") || ruta.endsWith(".mjs")) return "text/javascript";
        if (ruta.endsWith(".css")) return "text/css";
        if (ruta.endsWith(".json") || ruta.endsWith(".webmanifest")) return "application/json";
        if (ruta.endsWith(".pdf")) return "application/pdf";
        if (ruta.endsWith(".woff2")) return "font/woff2";
        if (ruta.endsWith(".woff")) return "font/woff";
        if (ruta.endsWith(".png")) return "image/png";
        if (ruta.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }
    private final class Sitio extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView vista, WebResourceRequest peticion) {
            return !paginaPropia(peticion.getUrl());
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView vista, WebResourceRequest peticion) {
            Uri u = peticion.getUrl();
            String p = u.getEncodedPath();
            if (propio(u) && "GET".equals(peticion.getMethod()) && p != null && p.startsWith("/lector/")
                    && p.matches("/[a-zA-Z0-9/_.-]+") && !p.contains("/.") && !p.contains("//")) {
                try {
                    String tipo = mime(p);
                    String encoding = tipo.startsWith("text/") || tipo.equals("application/json") ? "UTF-8" : null;
                    return new WebResourceResponse(tipo, encoding, getAssets().open(p.substring(1)));
                } catch (IOException e) { /* Recurso ausente en el APK. */ }
            }
            return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
        }
        @Override public void onPageStarted(WebView vista, String u, android.graphics.Bitmap icono) {
            if (puerto != null) { puerto.close(); puerto = null; }
        }
        @Override public void onPageFinished(WebView vista, String u) {
            if (!paginaPropia(Uri.parse(u)) || puerto != null) return;
            WebMessagePort[] par = vista.createWebMessageChannel();
            puerto = par[0];
            puerto.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
                @Override public void onMessage(WebMessagePort origen, WebMessage mensaje) {
                    if (par[0] == puerto) atender(mensaje.getData());
                }
            });
            vista.postWebMessage(new WebMessage("peshitta-puerto", new WebMessagePort[]{par[1]}), ORIGEN);
        }
        @Override public void onReceivedError(WebView vista, WebResourceRequest peticion, WebResourceError error) {
            if (peticion.isForMainFrame() && !isFinishing()) {
                new AlertDialog.Builder(Lector.this).setTitle("No se pudo abrir el lector")
                    .setPositiveButton("Volver a intentar", (d,n) -> vista.loadUrl(INICIO)).show();
            }
        }
    }

    private void contestar(int id, Object valor, String error) {
        if (puerto == null || isDestroyed()) return;
        try {
            JSONObject r = new JSONObject().put("id",id);
            if (error != null) r.put("error",error); else r.put("valor",valor);
            puerto.postMessage(new WebMessage(r.toString()));
        } catch (JSONException | IllegalStateException ignored) {
            // La página puede haberse cerrado mientras el usuario elegía un archivo.
        }
    }
    private void atender(String datos) {
        int id = 0;
        try {
            JSONObject m = new JSONObject(datos);
            id = m.getInt("id");
            switch (m.getString("accion")) {
                case "ruta":
                    String actual = ruta; ruta = ""; contestar(id, actual, null); return;
                case "permiso":
                    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                        if (permisoPedido != 0) throw new IllegalStateException("Hay una solicitud de notificaciones abierta.");
                        permisoPedido=id;
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISO);
                    } else contestar(id,Avisos.permitidos(this),null);
                    return;
                case "programar":
                    Avisos.programar(this, m.getJSONArray("avisos")); break;
                case "prueba":
                    Avisos.probar(this, m.getJSONObject("aviso")); break;
                case "detener":
                    Avisos.detener(this); break;
                case "texto":
                    Intent compartir = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT,m.getString("texto"));
                    startActivity(Intent.createChooser(compartir,"Compartir pasaje")); break;
                case "archivo":
                    if (exportacion != null) throw new IllegalStateException("Ya hay un archivo pendiente de guardar.");
                    String nombre=m.getString("nombre");
                    boolean pdf="Biblia-Peshitta.pdf".equals(nombre);
                    if (!pdf && (!nombre.matches("[^/\\\\]{1,150}\\.json") || !m.has("base64"))) throw new IllegalArgumentException("Archivo no válido.");
                    Intent elegirDestino = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(pdf ? "application/pdf":"application/json").putExtra(Intent.EXTRA_TITLE,nombre);
                    startActivityForResult(elegirDestino, GUARDAR);
                    exportacion=m; guardadoPedido=id; return;
                default: throw new IllegalArgumentException("Acción desconocida.");
            }
            contestar(id,true,null);
        } catch (Exception e) { contestar(id,null,e.getMessage()!=null?e.getMessage():"No se pudo completar la acción."); }
    }

    @Override public void onRequestPermissionsResult(int codigo,String[] permisos,int[] resultados) {
        super.onRequestPermissionsResult(codigo,permisos,resultados);
        if(codigo==PERMISO && permisoPedido!=0){
            int id=permisoPedido; permisoPedido=0; contestar(id,Avisos.permitidos(this),null);
        }
    }
    @Override protected void onActivityResult(int codigo,int resultado,Intent datos) {
        super.onActivityResult(codigo,resultado,datos);
        Uri u = resultado == RESULT_OK && datos != null ? datos.getData() : null;
        if (codigo==ELEGIR && elegir!=null) {
            elegir.onReceiveValue(u!=null && "content".equals(u.getScheme()) ? new Uri[]{u} : null); elegir=null;
        } else if (codigo==GUARDAR && exportacion!=null) {
            JSONObject archivo=exportacion; final int id=guardadoPedido;
            exportacion=null; guardadoPedido=0;
            if(u==null || !"content".equals(u.getScheme())) { contestar(id,false,null);return; }
            archivos.execute(() -> {
                boolean pdf="Biblia-Peshitta.pdf".equals(archivo.optString("nombre"));
                try(InputStream in=pdf?getAssets().open("lector/edicion/original.pdf"):new ByteArrayInputStream(Base64.decode(archivo.getString("base64"),Base64.DEFAULT));
                    OutputStream out=getContentResolver().openOutputStream(u,"wt")) {
                    if(out==null)throw new IOException();
                    byte[] buffer=new byte[32*1024]; int n;
                    while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
                } catch (Exception e) {runOnUiThread(() -> contestar(id,null,"No se pudo guardar el archivo."));return;}
                runOnUiThread(() -> contestar(id,true,null));
            });
        }
    }
    private void recibirRuta(Intent i) {
        if (i == null || !Avisos.ABRIR.equals(i.getAction())) return;
        String r=i.getStringExtra("ruta");
        if(Avisos.rutaValida(r)) ruta=r;
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent); recibirRuta(intent); activa();
    }
    private void activa() {
        if (web!=null && puerto!=null) web.evaluateJavascript("window.dispatchEvent(new Event('peshitta-activa'));",null);
    }
    @Override protected void onResume() { super.onResume(); activa(); }
    @Override public void onBackPressed() {
        if(web==null){super.onBackPressed();return;}
        web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(!d)return false;d.close();return true})()", v -> {
            if("true".equals(v))return;
            if(web.canGoBack())web.goBack();else finish();
        });
    }
    @Override protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado); estado.putString("pendiente",ruta);
        if(web!=null)estado.putString("pagina",web.getUrl());
    }
    @Override protected void onDestroy() {
        if(puerto!=null){puerto.close();puerto=null;}
        if(elegir!=null){elegir.onReceiveValue(null);elegir=null;}
        if(web!=null){((FrameLayout)web.getParent()).removeView(web);web.destroy();}
        archivos.shutdown();
        super.onDestroy();
    }
}
