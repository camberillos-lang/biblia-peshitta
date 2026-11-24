package org.bibliapeshitta.lectura;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.text.InputType;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;

/** Mantiene disponible el documento original si el motor web del dispositivo deja de funcionar. */
final class VisorOriginal extends LinearLayout {
    private static final int VERDE = Color.rgb(21, 62, 52);
    private final Activity actividad;
    private final ExecutorService trabajo = Executors.newSingleThreadExecutor();
    private final ImageView imagen;
    private final Button libros, pagina, anterior, siguiente;
    private final TextView aviso;
    private JSONArray indice;
    private PdfRenderer pdf;
    private int total, actual;
    private volatile int solicitud;
    private volatile boolean cerrado;

    VisorOriginal(Activity actividad, Runnable completo) {
        super(actividad);
        this.actividad = actividad;
        setOrientation(VERTICAL);
        setBackgroundColor(Color.WHITE);

        LinearLayout cabecera = fila();
        cabecera.setBackgroundColor(VERDE);
        TextView titulo = new TextView(actividad);
        titulo.setText("Biblia Peshitta");
        titulo.setTextSize(22);
        titulo.setTextColor(Color.WHITE);
        titulo.setTypeface(Typeface.SERIF);
        titulo.setPadding(dp(12), 0, 0, 0);
        cabecera.addView(titulo, new LayoutParams(0, -2, 1));
        Button completoBtn = boton("Lector completo", completo);
        completoBtn.setTextColor(Color.WHITE);
        cabecera.addView(completoBtn);

        aviso = new TextView(actividad);
        aviso.setGravity(Gravity.CENTER);
        aviso.setPadding(dp(12), dp(8), dp(12), dp(8));
        aviso.setTextColor(VERDE);
        aviso.setText("Abriendo tu PDF…");
        aviso.setAccessibilityLiveRegion(ACCESSIBILITY_LIVE_REGION_POLITE);
        addView(aviso, new LayoutParams(-1, -2));
        imagen = new ImageView(actividad);
        imagen.setScaleType(ImageView.ScaleType.FIT_CENTER);
        addView(imagen, new LayoutParams(-1, 0, 1));

        LinearLayout navegacion = fila();
        anterior = boton("‹", () -> mostrar(actual - 1));
        anterior.setContentDescription("Página anterior");
        siguiente = boton("›", () -> mostrar(actual + 1));
        siguiente.setContentDescription("Página siguiente");
        pagina = boton("Página", this::elegirPagina);
        libros = boton("Libros", this::elegirLibro);
        navegacion.addView(libros);
        navegacion.addView(anterior, new LayoutParams(dp(48), -2));
        navegacion.addView(pagina, new LayoutParams(0, -2, 1));
        navegacion.addView(siguiente, new LayoutParams(dp(48), -2));
        controles();
        trabajo.execute(this::abrir);
    }

    private int dp(int valor) {
        return Math.round(valor * getResources().getDisplayMetrics().density);
    }
    private LinearLayout fila() {
        LinearLayout fila = new LinearLayout(actividad);
        fila.setGravity(Gravity.CENTER_VERTICAL);
        addView(fila, new LayoutParams(-1, -2));
        return fila;
    }
    private Button boton(String texto, Runnable accion) {
        Button b = new Button(actividad, null, android.R.attr.borderlessButtonStyle);
        b.setAllCaps(false);
        b.setMinWidth(0);
        b.setMinimumWidth(0);
        b.setPadding(dp(8), 0, dp(8), 0);
        b.setTextColor(VERDE);
        b.setText(texto);
        b.setOnClickListener(v -> accion.run());
        return b;
    }

    private void abrir() {
        try {
            File copia = File.createTempFile("peshitta-", ".pdf", actividad.getCacheDir());
            try {
                try (InputStream in = actividad.getAssets().open("lector/edicion/original.pdf");
                     FileOutputStream out = new FileOutputStream(copia)) {
                    byte[] bloque = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(bloque)) != -1) out.write(bloque, 0, n);
                }
                ParcelFileDescriptor archivo = ParcelFileDescriptor.open(copia, ParcelFileDescriptor.MODE_READ_ONLY);
                try { pdf = new PdfRenderer(archivo); }
                catch (IOException | RuntimeException e) { archivo.close(); throw e; }
            } finally {
                // PdfRenderer conserva abierto el descriptor hasta cerrar el visor.
                copia.delete();
            }
            int paginas = pdf.getPageCount();
            JSONArray datos;
            try (InputStream in = actividad.getAssets().open("lector/edicion/indice-android.json");
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] bloque = new byte[4096];
                int n;
                while ((n = in.read(bloque)) != -1) out.write(bloque, 0, n);
                datos = new JSONArray(new String(out.toByteArray(), StandardCharsets.UTF_8));
            }
            actividad.runOnUiThread(() -> {
                if (cerrado) return;
                total = paginas;
                indice = datos;
                mostrar(actividad.getSharedPreferences("lectura-original", 0).getInt("pagina", 1));
            });
        } catch (IOException | JSONException | RuntimeException e) {
            actividad.runOnUiThread(() -> { if (!cerrado) aviso.setText("No se pudo abrir el PDF. Vuelve a abrir la app para reintentar."); });
        }
    }

    private void mostrar(int numero) {
        if (total == 0 || cerrado) return;
        actual = Math.max(1, Math.min(total, numero));
        final int destino = actual, turno = ++solicitud;
        final int ancho = Math.min(1600, Math.max(1000, getResources().getDisplayMetrics().widthPixels));
        pagina.setText(actual + " de " + total);
        pagina.setContentDescription("Ir a página. Página " + actual + " de " + total);
        controles();
        trabajo.execute(() -> {
            if (cerrado || turno != solicitud) return;
            try (PdfRenderer.Page p = pdf.openPage(destino - 1)) {
                float escala = Math.min((float) ancho / p.getWidth(), 2500f / p.getHeight());
                Bitmap b = Bitmap.createBitmap(Math.max(1, Math.round(p.getWidth() * escala)),
                        Math.max(1, Math.round(p.getHeight() * escala)), Bitmap.Config.ARGB_8888);
                b.eraseColor(Color.WHITE);
                p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                actividad.runOnUiThread(() -> {
                    if (cerrado || turno != solicitud) { b.recycle(); return; }
                    imagen.setImageBitmap(b);
                    imagen.setContentDescription("PDF original, página " + destino + " de " + total);
                    aviso.setVisibility(GONE);
                    actividad.getSharedPreferences("lectura-original", 0).edit().putInt("pagina", destino).apply();
                });
            } catch (RuntimeException error) {
                actividad.runOnUiThread(() -> {
                    if (!cerrado && turno == solicitud) {
                        aviso.setText("No se pudo mostrar esta página. Elige otra o vuelve a intentarlo.");
                        aviso.setVisibility(VISIBLE);
                    }
                });
            }
        });
    }

    private void controles() {
        anterior.setEnabled(actual > 1);
        siguiente.setEnabled(actual < total);
        pagina.setEnabled(total > 0);
        libros.setEnabled(indice != null && indice.length() > 0);
    }
    private void elegirPagina() {
        EditText entrada = new EditText(actividad);
        entrada.setInputType(InputType.TYPE_CLASS_NUMBER);
        entrada.setSingleLine();
        entrada.setText(String.valueOf(actual));
        entrada.selectAll();
        AlertDialog d = new AlertDialog.Builder(actividad).setTitle("Ir a página (1–" + total + ")")
                .setView(entrada).setNegativeButton("Cancelar", null).setPositiveButton("Ir", null).create();
        d.show();
        d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            try {
                int n = Integer.parseInt(entrada.getText().toString());
                if (n >= 1 && n <= total) { mostrar(n); d.dismiss(); return; }
            } catch (NumberFormatException ignored) { }
            entrada.setError("Elige una página entre 1 y " + total);
        });
    }
    private void elegirLibro() {
        String[] nombres = new String[indice.length()];
        for (int i = 0; i < nombres.length; i++) nombres[i] = indice.optJSONObject(i).optString("nombre");
        new AlertDialog.Builder(actividad).setTitle("Libros").setItems(nombres, (d, i) -> {
            JSONArray capitulos = indice.optJSONObject(i).optJSONArray("capitulos");
            String[] etiquetas = new String[capitulos.length()];
            for (int j = 0; j < etiquetas.length; j++) etiquetas[j] = "Capítulo " + capitulos.optJSONArray(j).optInt(0);
            new AlertDialog.Builder(actividad).setTitle(nombres[i]).setItems(etiquetas,
                    (dialogo, j) -> mostrar(capitulos.optJSONArray(j).optInt(1))).show();
        }).show();
    }
    void cerrar() {
        cerrado = true;
        imagen.setImageDrawable(null);
        trabajo.execute(() -> { if (pdf != null) pdf.close(); });
        trabajo.shutdown();
    }
}
