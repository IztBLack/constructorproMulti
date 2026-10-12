package com.mario.constructorpro.widgets

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import com.mario.constructorpro.R
import com.mario.constructorpro.widgets.WidgetsComun.abrirApp
import com.mario.constructorpro.widgets.WidgetsComun.abrirWeb
import com.mario.constructorpro.widgets.WidgetsComun.deOtroDia
import com.mario.constructorpro.widgets.WidgetsComun.entero
import com.mario.constructorpro.widgets.WidgetsComun.mostrar
import com.mario.constructorpro.widgets.WidgetsComun.pintarFicha
import com.mario.constructorpro.widgets.WidgetsComun.pintarMensaje
import com.mario.constructorpro.widgets.WidgetsComun.si
import com.mario.constructorpro.widgets.WidgetsComun.texto
import es.antonborri.home_widget.HomeWidgetProvider

/**
 * Widgets de la etapa 2: lo que mueve la oficina (material, programa y visto
 * bueno). La app los lee de Supabase y guarda la foto (`oficina_widgets.dart`,
 * `llavesOficina`); aquí solo se pinta. Al tocarlos se abre la WEB: el móvil
 * todavía no tiene esas pantallas.
 */
private fun pintarCada(
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

/**
 * Aún no se ha leído nada de la oficina (la app nunca tuvo señal con esta
 * cuenta). Devuelve true si pintó el aviso.
 */
private fun sinDatosOficina(
    c: Context,
    v: RemoteViews,
    p: SharedPreferences,
    contenido: Int,
    mensaje: Int,
): Boolean {
    if (si(p, "of_hay_datos")) return false
    mostrar(v, contenido, false)
    mostrar(v, mensaje, true)
    v.setTextViewText(mensaje, "Abre ConstructorPro con internet para ver esto aquí.")
    v.setOnClickPendingIntent(mensaje, abrirApp(c))
    return true
}

/** Pinta hasta 3 filas `<prefijo><i>_que / _cuando / _estado / _tono / _url`. */
private fun pintarFilas(
    c: Context,
    v: RemoteViews,
    p: SharedPreferences,
    prefijo: String,
    filas: List<List<Int>>,
): Int {
    val n = entero(p, "${prefijo}_n")
    filas.forEachIndexed { i, (fila, que, cuando, estado) ->
        mostrar(v, fila, i < n)
        if (i >= n) return@forEachIndexed
        v.setTextViewText(que, texto(p, "$prefijo${i}_que"))
        v.setTextViewText(cuando, texto(p, "$prefijo${i}_cuando"))
        v.setTextViewText(estado, texto(p, "$prefijo${i}_estado"))
        pintarFicha(c, v, estado, texto(p, "$prefijo${i}_tono"))
        v.setOnClickPendingIntent(fila, abrirWeb(c, texto(p, "$prefijo${i}_url")))
    }
    return n
}

/** «Material de la obra» (4×2): lo pedido, en qué va, y lo que llegó hoy. */
class MaterialWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarCada(context, appWidgetManager, appWidgetIds, R.layout.widget_material) { v ->
        pintar(context, v, widgetData)
    }

    private val filas = listOf(
        listOf(R.id.mat0, R.id.mat0_que, R.id.mat0_cuando, R.id.mat0_estado),
        listOf(R.id.mat1, R.id.mat1_que, R.id.mat1_cuando, R.id.mat1_estado),
        listOf(R.id.mat2, R.id.mat2_que, R.id.mat2_cuando, R.id.mat2_estado),
    )

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.mat_contenido, R.id.mat_mensaje, si(p, "mat_ok"), texto(p, "mat_no"))) return
        if (sinDatosOficina(c, v, p, R.id.mat_contenido, R.id.mat_mensaje)) return
        v.setOnClickPendingIntent(R.id.mat_raiz, abrirWeb(c, texto(p, "mat_url")))

        // «Hoy llegó…» es de hoy: con la foto de ayer no se enseña.
        val llego = if (deOtroDia(p)) "" else texto(p, "mat_llego")
        mostrar(v, R.id.mat_llego, llego.isNotEmpty())
        v.setTextViewText(R.id.mat_llego, llego)

        val n = pintarFilas(c, v, p, "mat", filas)
        mostrar(v, R.id.mat_vacio, n == 0)
        v.setTextViewText(R.id.mat_actualizado, texto(p, "of_actualizado"))
    }
}

/** «Lo que toca esta semana» (4×2): lo atrasado primero, luego lo de la semana. */
class ProgramaWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarCada(context, appWidgetManager, appWidgetIds, R.layout.widget_programa) { v ->
        pintar(context, v, widgetData)
    }

    private val filas = listOf(
        listOf(R.id.pr0, R.id.pr0_que, R.id.pr0_cuando, R.id.pr0_estado),
        listOf(R.id.pr1, R.id.pr1_que, R.id.pr1_cuando, R.id.pr1_estado),
        listOf(R.id.pr2, R.id.pr2_que, R.id.pr2_cuando, R.id.pr2_estado),
    )

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.pr_contenido, R.id.pr_mensaje, si(p, "pr_ok"), texto(p, "pr_no"))) return
        if (sinDatosOficina(c, v, p, R.id.pr_contenido, R.id.pr_mensaje)) return
        v.setOnClickPendingIntent(R.id.pr_raiz, abrirApp(c))

        val atrasadas = entero(p, "pr_atrasadas")
        mostrar(v, R.id.pr_atrasadas, atrasadas > 0)
        v.setTextViewText(
            R.id.pr_atrasadas,
            if (atrasadas == 1) "1 atrasada" else "$atrasadas atrasadas",
        )
        val n = pintarFilas(c, v, p, "pr", filas)
        mostrar(v, R.id.pr_vacio, n == 0)
        v.setTextViewText(R.id.pr_actualizado, texto(p, "of_actualizado"))
    }
}

/** «Por aprobar» (2×2): cuántas cosas esperan visto bueno. Nunca montos. */
class PorAprobarWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarCada(context, appWidgetManager, appWidgetIds, R.layout.widget_por_aprobar) { v ->
        pintar(context, v, widgetData)
    }

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.ap_contenido, R.id.ap_mensaje, si(p, "ap_ok"), texto(p, "ap_no"))) return
        if (sinDatosOficina(c, v, p, R.id.ap_contenido, R.id.ap_mensaje)) return
        v.setOnClickPendingIntent(R.id.ap_raiz, abrirWeb(c, texto(p, "ap_url")))

        val total = entero(p, "ap_total")
        v.setTextViewText(R.id.ap_total, total.toString())
        v.setTextViewText(
            R.id.ap_detalle,
            if (total == 0) "Nada espera tu visto bueno." else texto(p, "ap_detalle"),
        )
        v.setTextViewText(R.id.ap_actualizado, texto(p, "of_actualizado"))
    }
}

// ---------------------------------------------------------------- Etapa 3

/** «Seguridad de hoy» (4×2): obras sin revisión diaria e incidentes de la semana. */
class SeguridadWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarCada(context, appWidgetManager, appWidgetIds, R.layout.widget_seguridad) { v ->
        pintar(context, v, widgetData)
    }

    private val filas = listOf(
        listOf(R.id.sg0, R.id.sg0_que, R.id.sg0_cuando, R.id.sg0_estado),
        listOf(R.id.sg1, R.id.sg1_que, R.id.sg1_cuando, R.id.sg1_estado),
        listOf(R.id.sg2, R.id.sg2_que, R.id.sg2_cuando, R.id.sg2_estado),
    )

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.sg_contenido, R.id.sg_mensaje, si(p, "sg_ok"), texto(p, "sg_no"))) return
        if (sinDatosOficina(c, v, p, R.id.sg_contenido, R.id.sg_mensaje)) return
        v.setOnClickPendingIntent(R.id.sg_raiz, abrirApp(c))

        // La revisión es de HOY: con la foto de ayer no se sabe cuáles faltan.
        if (deOtroDia(p)) {
            v.setTextViewText(R.id.sg_resumen, "Abre la app para ver la revisión de hoy")
            filas.forEach { mostrar(v, it[0], false) }
        } else {
            v.setTextViewText(R.id.sg_resumen, texto(p, "sg_resumen"))
            pintarFilas(c, v, p, "sg", filas)
        }
        val incidentes = texto(p, "sg_incidentes")
        mostrar(v, R.id.sg_incidentes, incidentes.isNotEmpty())
        v.setTextViewText(R.id.sg_incidentes, incidentes)
        v.setTextViewText(R.id.sg_actualizado, texto(p, "of_actualizado"))
    }
}

/** «Garantías abiertas» (4×2): lo de hoy primero, luego lo que más espera. */
class GarantiasWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarCada(context, appWidgetManager, appWidgetIds, R.layout.widget_garantias) { v ->
        pintar(context, v, widgetData)
    }

    private val filas = listOf(
        listOf(R.id.ga0, R.id.ga0_que, R.id.ga0_cuando, R.id.ga0_estado),
        listOf(R.id.ga1, R.id.ga1_que, R.id.ga1_cuando, R.id.ga1_estado),
        listOf(R.id.ga2, R.id.ga2_que, R.id.ga2_cuando, R.id.ga2_estado),
    )

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.ga_contenido, R.id.ga_mensaje, si(p, "ga_ok"), texto(p, "ga_no"))) return
        if (sinDatosOficina(c, v, p, R.id.ga_contenido, R.id.ga_mensaje)) return
        v.setOnClickPendingIntent(R.id.ga_raiz, abrirWeb(c, "https://constructorpro-tawny.vercel.app/admin/postventa"))

        val total = entero(p, "ga_total")
        mostrar(v, R.id.ga_total, total > 0)
        v.setTextViewText(R.id.ga_total, total.toString())
        val n = pintarFilas(c, v, p, "ga", filas)
        mostrar(v, R.id.ga_vacio, n == 0)
        v.setTextViewText(R.id.ga_actualizado, texto(p, "of_actualizado"))
    }
}

/** «Herramienta en obra» (4×2): qué anda fuera, quién la tiene, cuál ya debió volver. */
class HerramientaWidget : HomeWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) = pintarCada(context, appWidgetManager, appWidgetIds, R.layout.widget_herramienta) { v ->
        pintar(context, v, widgetData)
    }

    private val filas = listOf(
        listOf(R.id.he0, R.id.he0_que, R.id.he0_cuando, R.id.he0_estado),
        listOf(R.id.he1, R.id.he1_que, R.id.he1_cuando, R.id.he1_estado),
        listOf(R.id.he2, R.id.he2_que, R.id.he2_cuando, R.id.he2_estado),
    )

    private fun pintar(c: Context, v: RemoteViews, p: SharedPreferences) {
        if (pintarMensaje(c, v, p, R.id.he_contenido, R.id.he_mensaje, si(p, "he_ok"), texto(p, "he_no"))) return
        if (sinDatosOficina(c, v, p, R.id.he_contenido, R.id.he_mensaje)) return
        v.setOnClickPendingIntent(R.id.he_raiz, abrirWeb(c, "https://constructorpro-tawny.vercel.app/admin/herramienta"))

        val vencidas = entero(p, "he_vencidas")
        mostrar(v, R.id.he_vencidas, vencidas > 0)
        v.setTextViewText(R.id.he_vencidas, if (vencidas == 1) "1 por regresar" else "$vencidas por regresar")
        val n = pintarFilas(c, v, p, "he", filas)
        mostrar(v, R.id.he_vacio, n == 0)
        v.setTextViewText(R.id.he_actualizado, texto(p, "of_actualizado"))
    }
}
