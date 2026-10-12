package com.mario.constructorpro.widgets

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import com.mario.constructorpro.MainActivity
import com.mario.constructorpro.R
import es.antonborri.home_widget.HomeWidgetLaunchIntent
import java.time.LocalDate

/**
 * Lo que comparten los widgets de la pantalla de inicio.
 *
 * Los widgets NUNCA consultan la base: leen la foto que la app arma en Dart
 * (`lib/core/widgets_inicio/resumen_widgets.dart`, función `llavesWidgets`) y
 * guarda con `HomeWidget`. Si cambian las llaves allá, cambian aquí.
 */
internal object WidgetsComun {

    /** Lee un entero aunque Flutter lo haya guardado como Int o como Long. */
    fun entero(p: SharedPreferences, llave: String): Int =
        (p.all[llave] as? Number)?.toInt() ?: 0

    fun texto(p: SharedPreferences, llave: String): String =
        p.getString(llave, null) ?: ""

    fun si(p: SharedPreferences, llave: String): Boolean =
        p.getBoolean(llave, false)

    /** Nunca se ha abierto la app con esta versión: no hay foto todavía. */
    fun sinFoto(p: SharedPreferences): Boolean = entero(p, "w_version") == 0

    /** La sesión se cerró o el teléfono se vació para otra cuenta. */
    fun vacio(p: SharedPreferences): Boolean = si(p, "w_vacio")

    /** La foto es de otro día: lo de «hoy» ya no vale (nadie abrió la app hoy). */
    fun deOtroDia(p: SharedPreferences): Boolean =
        texto(p, "w_dia") != LocalDate.now().toString()

    /** `constructorpro://abrir/<destino>?obra=<id>`, el formato de `enlaces_inicio.dart`. */
    fun abrir(context: Context, destino: String, obraId: String? = null): PendingIntent {
        val b = Uri.Builder().scheme("constructorpro").authority("abrir").appendPath(destino)
        if (!obraId.isNullOrEmpty()) b.appendQueryParameter("obra", obraId)
        return HomeWidgetLaunchIntent.getActivity(context, MainActivity::class.java, b.build())
    }

    /** Abre la app sin destino (la pantalla de siempre). */
    fun abrirApp(context: Context): PendingIntent =
        HomeWidgetLaunchIntent.getActivity(context, MainActivity::class.java)

    /**
     * Abre una página de la web (etapa 2: compras, programa y aprobaciones aún
     * no tienen pantalla en el móvil). Sin URL, abre la app.
     */
    fun abrirWeb(context: Context, url: String): PendingIntent {
        if (!url.startsWith("https://")) return abrirApp(context)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        // Un requestCode por URL: si no, Android reusaría el mismo PendingIntent
        // para todas las filas.
        return PendingIntent.getActivity(
            context,
            url.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Pinta una ficha de estado con su par de colores (mismo catálogo que Dart). */
    fun pintarFicha(context: Context, v: RemoteViews, id: Int, tono: String) {
        val (fondo, color) = when (tono) {
            "verde" -> R.drawable.widget_chip_verde to R.color.w_verde
            "ambar" -> R.drawable.widget_chip_ambar to R.color.w_ambar
            "azul" -> R.drawable.widget_chip_azul to R.color.w_azul
            "rojo" -> R.drawable.widget_chip_rojo to R.color.w_rojo
            else -> R.drawable.widget_chip_neutro to R.color.w_texto_medio
        }
        v.setInt(id, "setBackgroundResource", fondo)
        v.setTextColor(id, context.getColor(color))
    }

    fun mostrar(v: RemoteViews, id: Int, visible: Boolean) =
        v.setViewVisibility(id, if (visible) View.VISIBLE else View.GONE)

    /**
     * Pinta el mensaje de «no hay nada que enseñar» y esconde el contenido.
     * Devuelve true si se pintó (y quien llama ya no debe pintar más).
     */
    fun pintarMensaje(
        context: Context,
        v: RemoteViews,
        p: SharedPreferences,
        contenido: Int,
        mensaje: Int,
        permitido: Boolean,
        motivo: String = "",
    ): Boolean {
        val texto = when {
            sinFoto(p) -> "Abre ConstructorPro una vez para ver tus datos aquí."
            vacio(p) -> "Inicia sesión en ConstructorPro para ver tus datos."
            !permitido -> motivo.ifEmpty { "No disponible con tu cuenta." }
            else -> null
        }
        if (texto == null) {
            mostrar(v, contenido, true)
            mostrar(v, mensaje, false)
            return false
        }
        mostrar(v, contenido, false)
        mostrar(v, mensaje, true)
        v.setTextViewText(mensaje, texto)
        v.setOnClickPendingIntent(mensaje, abrirApp(context))
        return true
    }
}
