package com.mario.constructorpro.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import com.mario.constructorpro.R
import com.mario.constructorpro.widgets.WidgetsComun.abrir
import com.mario.constructorpro.widgets.WidgetsComun.abrirApp
import com.mario.constructorpro.widgets.WidgetsComun.deOtroDia
import com.mario.constructorpro.widgets.WidgetsComun.entero
import com.mario.constructorpro.widgets.WidgetsComun.mostrar
import com.mario.constructorpro.widgets.WidgetsComun.pintarMensaje
import com.mario.constructorpro.widgets.WidgetsComun.si
import com.mario.constructorpro.widgets.WidgetsComun.texto
import es.antonborri.home_widget.HomeWidgetProvider

/**
 * Los cuatro widgets de la pantalla de inicio (etapa 1). Cada uno solo pinta
 * las llaves de `llavesWidgets` (Dart); ninguno decide permisos ni cuenta nada.
 * La única lógica aquí es la del día: si la foto es de ayer, lo de «hoy» se
 * enseña en cero en vez de enseñar los datos de ayer como si fueran de hoy.
 */
private fun pintarTodos(
    context: Context,
    manager: AppWidgetManager,
    ids: IntArray,
    layout: Int,
    pintar: (RemoteViews) -> Unit,
) {
    for (id in ids) {
        val v = RemoteViews(context.packageName, layout)
        pintar(v)
        manager.updateAppWidget(id, v)
    }
}

private fun plural(n: Int, uno: String, varios: String) = if (n == 1) "1 $uno" else "$n $varios"

/** «Pase de lista de hoy» (4×2): la obra con más gente, por cuadrilla. */
class PaseListaWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarTodos(context, appWidgetManager, appWidgetIds, R.layout.widget_pase_lista) { v ->
        pintar(context, v, widgetData)
    }

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.pase_contenido, R.id.pase_mensaje, si(p, "pase_ok"))) return
        val ir = abrir(c, "pase-lista")
        if (!si(p, "pase_hay_obra")) {
            mostrar(v, R.id.pase_contenido, false)
            mostrar(v, R.id.pase_mensaje, true)
            v.setTextViewText(R.id.pase_mensaje, "No hay gente asignada a obras activas.")
            v.setOnClickPendingIntent(R.id.pase_mensaje, ir)
            return
        }

        val ayer = deOtroDia(p)
        val presentes = if (ayer) 0 else entero(p, "pase_presentes")
        val hora = texto(p, "pase_hora")
        v.setTextViewText(R.id.pase_titulo, "Pase de lista · ${texto(p, "pase_obra")}")
        v.setTextViewText(
            R.id.pase_sub,
            if (ayer || hora.isEmpty()) "Hoy · aún no se pasa lista" else "Hoy · tomado $hora",
        )
        v.setTextViewText(R.id.pase_presentes, presentes.toString())
        v.setTextViewText(R.id.pase_de, "de ${entero(p, "pase_total")} presentes")

        // Los cuadros por cuadrilla son de hoy: con la foto de ayer no se enseñan.
        val n = if (ayer) 0 else entero(p, "pase_cu_n")
        mostrar(v, R.id.pase_cuadros, n > 0)
        val cuadros = listOf(
            Triple(R.id.pase_cu0, R.id.pase_cu0_nombre, R.id.pase_cu0_txt),
            Triple(R.id.pase_cu1, R.id.pase_cu1_nombre, R.id.pase_cu1_txt),
        )
        cuadros.forEachIndexed { i, (caja, nombre, txt) ->
            mostrar(v, caja, i < n)
            if (i < n) {
                v.setTextViewText(nombre, texto(p, "pase_cu${i}_nombre"))
                v.setTextViewText(txt, texto(p, "pase_cu${i}_txt"))
            }
        }

        val porSubir = if (ayer) 0 else entero(p, "pase_por_subir")
        mostrar(v, R.id.pase_chip, porSubir > 0)
        v.setTextViewText(R.id.pase_chip, "$porSubir por subir")
        mostrar(v, R.id.pase_actualizado, porSubir == 0)
        v.setTextViewText(
            R.id.pase_actualizado,
            if (ayer) "Abre la app para actualizar" else "Actualizado ${texto(p, "w_actualizado")}",
        )

        mostrar(v, R.id.pase_boton, si(p, "pase_puede_pasar"))
        v.setOnClickPendingIntent(R.id.pase_boton, ir)
        v.setOnClickPendingIntent(R.id.pase_raiz, ir)
    }
}

/** «Avisos de la oficina» (4×2): instrucciones, aclaraciones y notas nuevas. */
class AvisosWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarTodos(context, appWidgetManager, appWidgetIds, R.layout.widget_avisos) { v ->
        pintar(context, v, widgetData)
    }

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.av_contenido, R.id.av_mensaje, si(p, "av_ok"))) return
        v.setOnClickPendingIntent(R.id.av_raiz, abrirApp(c))

        val nuevos = entero(p, "av_nuevos")
        mostrar(v, R.id.av_nuevos, nuevos > 0)
        v.setTextViewText(R.id.av_nuevos, plural(nuevos, "nuevo", "nuevos"))

        val n = entero(p, "av_n")
        mostrar(v, R.id.av_vacio, n == 0)
        val filas = listOf(
            Triple(R.id.av0, R.id.av0_titulo, R.id.av0_texto),
            Triple(R.id.av1, R.id.av1_titulo, R.id.av1_texto),
            Triple(R.id.av2, R.id.av2_titulo, R.id.av2_texto),
        )
        filas.forEachIndexed { i, (fila, titulo, cuerpo) ->
            mostrar(v, fila, i < n)
            if (i < n) {
                v.setTextViewText(titulo, texto(p, "av${i}_titulo"))
                v.setTextViewText(cuerpo, texto(p, "av${i}_texto"))
                v.setOnClickPendingIntent(
                    fila,
                    abrir(c, texto(p, "av${i}_destino"), texto(p, "av${i}_obra_id")),
                )
            }
        }
    }
}

/** «Acciones rápidas» (4×1): solo los botones que el rol puede usar. */
class AccionesWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarTodos(context, appWidgetManager, appWidgetIds, R.layout.widget_acciones) { v ->
        pintar(context, v, widgetData)
    }

    private val acciones = listOf(
        Triple("ac_pase", R.id.ac_pase, "pase-lista"),
        Triple("ac_bitacora", R.id.ac_bitacora, "entrada-bitacora"),
        Triple("ac_nota", R.id.ac_nota, "nota-nueva"),
        Triple("ac_gasto", R.id.ac_gasto, "gasto-caja"),
    )

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        val alguna = acciones.any { si(p, it.first) }
        if (pintarMensaje(c, v, p, R.id.ac_contenido, R.id.ac_mensaje, alguna)) return
        for ((llave, id, destino) in acciones) {
            mostrar(v, id, si(p, llave))
            v.setOnClickPendingIntent(id, abrir(c, destino))
        }
    }
}

/** «Hoy en las obras» (4×3): cuánta gente hay en cada obra y cuáles faltan. */
class ObrasHoyWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarTodos(context, appWidgetManager, appWidgetIds, R.layout.widget_obras_hoy) { v ->
        pintar(context, v, widgetData)
    }

    private val filas = listOf(
        listOf(R.id.oh0, R.id.oh0_nombre, R.id.oh0_detalle, R.id.oh0_cuenta),
        listOf(R.id.oh1, R.id.oh1_nombre, R.id.oh1_detalle, R.id.oh1_cuenta),
        listOf(R.id.oh2, R.id.oh2_nombre, R.id.oh2_detalle, R.id.oh2_cuenta),
        listOf(R.id.oh3, R.id.oh3_nombre, R.id.oh3_detalle, R.id.oh3_cuenta),
        listOf(R.id.oh4, R.id.oh4_nombre, R.id.oh4_detalle, R.id.oh4_cuenta),
    )

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.oh_contenido, R.id.oh_mensaje, si(p, "oh_ok"))) return
        v.setOnClickPendingIntent(R.id.oh_raiz, abrirApp(c))

        val ayer = deOtroDia(p)
        val personas = if (ayer) 0 else entero(p, "oh_personas")
        v.setTextViewText(R.id.oh_personas, plural(personas, "persona", "personas"))

        val n = entero(p, "oh_n")
        mostrar(v, R.id.oh_vacio, n == 0)
        filas.forEachIndexed { i, (fila, nombre, detalle, cuenta) ->
            mostrar(v, fila, i < n)
            if (i >= n) return@forEachIndexed
            val falta = ayer || si(p, "oh${i}_falta")
            v.setTextViewText(nombre, texto(p, "oh${i}_nombre"))
            v.setTextViewText(detalle, if (ayer) "Aún no pasan lista" else texto(p, "oh${i}_detalle"))
            v.setTextViewText(cuenta, if (ayer) "Sin pase" else texto(p, "oh${i}_cuenta"))
            v.setInt(
                cuenta,
                "setBackgroundResource",
                if (falta) R.drawable.widget_chip_ambar else R.drawable.widget_chip_verde,
            )
            v.setTextColor(cuenta, c.getColor(if (falta) R.color.w_ambar else R.color.w_verde))
            v.setOnClickPendingIntent(fila, abrir(c, "obra", texto(p, "oh${i}_id")))
        }
    }
}
