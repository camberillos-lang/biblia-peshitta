package org.bibliapeshitta.lectura;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class Avisos extends BroadcastReceiver {
    private static final String CANAL = "pasajes";
    private static final String SONAR = "org.bibliapeshitta.lectura.SONAR";
    static final String ABRIR = "org.bibliapeshitta.lectura.ABRIR";
    private static final int FLAGS = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences("avisos",Context.MODE_PRIVATE); }
    private static NotificationManager canal(Context c) {
        NotificationManager n=c.getSystemService(NotificationManager.class);
        n.createNotificationChannel(new NotificationChannel(CANAL,"Pasajes de lectura",NotificationManager.IMPORTANCE_DEFAULT));
        return n;
    }
    static boolean permitidos(Context c) {
        NotificationManager n=canal(c);
        return n.areNotificationsEnabled() && n.getNotificationChannel(CANAL).getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    static boolean rutaValida(String r) {
        return r!=null && r.length()<=3000 && (r.startsWith("#aviso/") || r.startsWith("#pasaje/"))
            && !r.contains("\n") && !r.contains("\r");
    }
    private static void validar(JSONObject aviso) throws JSONException {
        if(!aviso.getString("id").matches("[a-zA-Z0-9_-]{1,80}") || aviso.getLong("at")<=0
                || aviso.getString("cuerpo").trim().isEmpty() || !rutaValida(aviso.getString("ruta"))) {
            throw new JSONException("Este aviso no contiene un pasaje válido.");
        }
    }
    private static JSONArray lista(Context c) throws JSONException {
        return new JSONArray(prefs(c).getString("programa","[]"));
    }
    private static PendingIntent alarma(Context c) {
        return PendingIntent.getBroadcast(c,0,new Intent(c,Avisos.class).setAction(SONAR),FLAGS);
    }
    static void programar(Context c,JSONArray avisos) throws JSONException {
        if(avisos.length()>60)throw new JSONException("Demasiados avisos pendientes.");
        for(int i=0;i<avisos.length();i++)validar(avisos.getJSONObject(i));
        prefs(c).edit().putString("programa",avisos.toString()).apply();
        siguiente(c);
    }
    static void probar(Context c,JSONObject aviso) throws JSONException {
        validar(aviso);
        if(!permitidos(c))throw new IllegalStateException("Activa las notificaciones para recibir el pasaje de prueba.");
        prefs(c).edit().putString("prueba",aviso.toString()).apply();
        siguiente(c);
        Context app=c.getApplicationContext();
        new Handler(Looper.getMainLooper()).postDelayed(() -> entregar(app), Math.max(1,aviso.getLong("at")-System.currentTimeMillis()+50));
    }
    static void detener(Context c) {
        prefs(c).edit().clear().apply();
        c.getSystemService(AlarmManager.class).cancel(alarma(c));
    }
    private static void siguiente(Context c) throws JSONException {
        JSONArray avisos=lista(c);
        long proximo=Long.MAX_VALUE;
        for(int i=0;i<avisos.length();i++)proximo=Math.min(proximo,avisos.getJSONObject(i).getLong("at"));
        String prueba=prefs(c).getString("prueba",null);
        if(prueba!=null)proximo=Math.min(proximo,new JSONObject(prueba).getLong("at"));
        AlarmManager sistema=c.getSystemService(AlarmManager.class);
        PendingIntent intent=alarma(c);
        if(proximo==Long.MAX_VALUE){sistema.cancel(intent);return;}
        proximo=Math.max(System.currentTimeMillis()+50,proximo);
        if(Build.VERSION.SDK_INT<31 || sistema.canScheduleExactAlarms()) {
            try { sistema.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,proximo,intent); return; }
            catch (SecurityException ignored) { /* El permiso puede cambiar durante la programación. */ }
        }
        sistema.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,proximo,intent);
    }
    private static void mostrar(Context c,JSONObject aviso) throws JSONException {
        if(!permitidos(c))return;
        String id=aviso.getString("id"),texto=aviso.getString("cuerpo");
        Intent abrir=new Intent(c,Lector.class).setAction(ABRIR)
            .setData(new Uri.Builder().scheme("peshitta").authority("pasaje").appendPath(id).build())
            .putExtra("ruta",aviso.getString("ruta")).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tocar=PendingIntent.getActivity(c,0,abrir,FLAGS);
        Notification n=new Notification.Builder(c,CANAL).setSmallIcon(R.drawable.aviso)
            .setContentTitle("Biblia Peshitta").setContentText(texto)
            .setStyle(new Notification.BigTextStyle().bigText(texto)).setContentIntent(tocar)
            .addAction(new Notification.Action.Builder(null,"Ver pasaje completo",tocar).build()).setAutoCancel(true).build();
        canal(c).notify(id,1,n);
    }
    private static void entregar(Context c) {
        try {
            long ahora=System.currentTimeMillis();
            JSONArray todos=lista(c), futuros=new JSONArray(); JSONObject ultimo=null, prueba=null;
            for(int i=0;i<todos.length();i++){
                JSONObject a=todos.getJSONObject(i);
                if(a.getLong("at")>ahora)futuros.put(a);
                else if(ultimo==null||a.getLong("at")>=ultimo.getLong("at"))ultimo=a;
            }
            SharedPreferences.Editor editor=prefs(c).edit().putString("programa",futuros.toString());
            String p=prefs(c).getString("prueba",null);
            if(p!=null){
                JSONObject a=new JSONObject(p);
                if(a.getLong("at")<=ahora){prueba=a; editor.remove("prueba");}
            }
            editor.apply();
            if(ultimo!=null)mostrar(c,ultimo);
            if(prueba!=null)mostrar(c,prueba);
            siguiente(c);
        } catch (JSONException e) { detener(c); }
    }
    @Override public void onReceive(Context c,Intent i) {
        String a=i.getAction();
        if(SONAR.equals(a)||Intent.ACTION_BOOT_COMPLETED.equals(a)||Intent.ACTION_MY_PACKAGE_REPLACED.equals(a))entregar(c);
    }
}
